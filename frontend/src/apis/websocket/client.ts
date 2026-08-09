import type { ClientMessage } from '@ai-chat/shared';
import { serializeClientMessage } from './messageParser';

export type WebSocketStatus = 'connecting' | 'open' | 'closed';

export type MessageHandler = (data: string) => void;
export type StatusHandler = (status: WebSocketStatus) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandler: MessageHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private manualClose = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
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
    this.setStatus('connecting');

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      this.setStatus('open');
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      if (typeof event.data === 'string') {
        this.messageHandler?.(event.data);
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
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
    this.connect();
  }

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(serializeClientMessage(message));
    return true;
  }

  getStatus(): WebSocketStatus {
    if (!this.ws) return 'closed';
    if (this.ws.readyState === WebSocket.CONNECTING) return 'connecting';
    if (this.ws.readyState === WebSocket.OPEN) return 'open';
    return 'closed';
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
