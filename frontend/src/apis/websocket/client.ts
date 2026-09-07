import type { ClientMessage } from '@ai-chat/shared';
import { parseServerMessage, serializeClientMessage } from './messageParser';

export type WebSocketStatus = 'connecting' | 'open' | 'closed';

export type AuthFailureReason = 'missing_token' | 'unauthorized' | 'expired';

export type MessageHandler = (data: string) => void;
export type StatusHandler = (status: WebSocketStatus) => void;

export interface WebSocketClientOptions {
  /**
   * 返回当前 Bearer session token，用于 `connected` 后的 `{ type: 'auth' }`。
   * 除非 `skipAuth` 为 true，否则必填。
   */
  getAuthToken?: () => string | null | undefined;
  /** 鉴权失败时回调（缺少 token、会话过期、UNAUTHORIZED 等）。 */
  onAuthFailure?: (reason: AuthFailureReason) => void;
  /**
   * 在发送 `{ type: 'auth' }` 前校验本地会话是否仍有效（如 expiresAt）。
   * 返回 false 时不发 auth，并触发 onAuthFailure('expired')。
   */
  isSessionValid?: () => boolean;
  /**
   * 跳过 WS 鉴权握手（仅 UI / 测试）。勿用于受保护 backend。
   */
  skipAuth?: boolean;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private options: WebSocketClientOptions;
  private messageHandler: MessageHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private manualClose = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** skipAuth 或收到服务端 `auth_ok` 前为 false。 */
  private authReady = false;

  constructor(url: string, options: WebSocketClientOptions = {}) {
    this.url = url;
    this.options = options;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onStatusChange(handler: StatusHandler): void {
    this.statusHandler = handler;
  }

  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.manualClose = false;
    this.authReady = Boolean(this.options.skipAuth);
    this.setStatus('connecting');

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      if (this.options.skipAuth) {
        this.authReady = true;
        this.setStatus('open');
      }
      // 否则保持 `connecting` 直至 `auth_ok`。
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      if (typeof event.data !== 'string') return;

      this.handleProtocolMessage(event.data);
      this.messageHandler?.(event.data);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authReady = false;
      this.setStatus('closed');
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose 将处理重连
    };
  }

  /** 拆除连接且不自动重连；状态变为 closed。 */
  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.teardownSocket();
    this.authReady = false;
    this.setStatus('closed');
  }

  /**
   * 用户主动重连：跳过闪烁 `closed`，避免断连
   * banner 引发布局跳动。直接进入 connecting。
   */
  reconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.teardownSocket();
    this.authReady = false;
    this.connect();
  }

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }
    if (
      !this.authReady &&
      message.type !== 'auth' &&
      message.type !== 'ping'
    ) {
      return false;
    }
    this.ws.send(serializeClientMessage(message));
    return true;
  }

  getStatus(): WebSocketStatus {
    if (!this.ws) return 'closed';
    if (this.ws.readyState === WebSocket.CONNECTING) return 'connecting';
    if (this.ws.readyState === WebSocket.OPEN) {
      return this.authReady ? 'open' : 'connecting';
    }
    return 'closed';
  }

  private handleProtocolMessage(raw: string): void {
    if (this.options.skipAuth) {
      return;
    }

    const message = parseServerMessage(raw);
    if (!message) {
      return;
    }

    if (message.type === 'connected') {
      if (this.options.isSessionValid && !this.options.isSessionValid()) {
        this.failAuth('expired');
        return;
      }
      const token = this.options.getAuthToken?.()?.trim() ?? '';
      if (!token) {
        this.failAuth('missing_token');
        return;
      }
      this.send({ type: 'auth', token });
      return;
    }

    if (message.type === 'auth_ok') {
      this.authReady = true;
      this.setStatus('open');
      return;
    }

    if (message.type === 'error' && message.code === 'UNAUTHORIZED') {
      this.failAuth('unauthorized');
    }
  }

  private failAuth(reason: AuthFailureReason): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.teardownSocket();
    this.authReady = false;
    this.setStatus('closed');
    this.options.onAuthFailure?.(reason);
  }

  private teardownSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;

    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;

    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    // 指数退避：约 1s、2s、4s、8s、16s + 最多 30% 随机 jitter
    const baseDelayMs = Math.pow(2, this.reconnectAttempts) * 1000;
    const jitterMs = Math.random() * baseDelayMs * 0.3;
    const delay = Math.round(baseDelayMs + jitterMs);
    this.reconnectAttempts += 1;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: WebSocketStatus): void {
    this.statusHandler?.(status);
  }
}
