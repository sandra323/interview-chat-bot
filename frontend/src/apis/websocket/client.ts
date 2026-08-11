import type { ClientMessage } from '@ai-chat/shared';
import { parseServerMessage, serializeClientMessage } from './messageParser';

export type WebSocketStatus = 'connecting' | 'open' | 'closed';

export type MessageHandler = (data: string) => void;
export type StatusHandler = (status: WebSocketStatus) => void;

export interface WebSocketClientOptions {
  /**
   * Return the current Bearer session token for post-`connected` `{ type: 'auth' }`.
   * Required unless `skipAuth` is true.
   */
  getAuthToken?: () => string | null | undefined;
  /** Called when auth fails (missing token, UNAUTHORIZED, etc.). */
  onAuthFailure?: (reason: 'missing_token' | 'unauthorized') => void;
  /**
   * Skip WS auth handshake (UI-only / tests). Do not use against a protected backend.
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
  private maxReconnectAttempts = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** False until skipAuth or server `auth_ok`. */
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
      // Otherwise stay `connecting` until `auth_ok`.
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
      // onclose will handle reconnect
    };
  }

  /** Tear down without auto-reconnect; status becomes closed. */
  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.teardownSocket();
    this.authReady = false;
    this.setStatus('closed');
  }

  /**
   * User-initiated reconnect: skip flashing `closed` so the disconnect
   * banner does not cause a layout jump. Goes straight to connecting.
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

  private failAuth(reason: 'missing_token' | 'unauthorized'): void {
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

    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
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
