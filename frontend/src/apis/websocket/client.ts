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
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.manualClose = false;
    this.setStatus('connecting');

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.messageHandler?.(event.data);
      }
    };

    this.ws.onclose = () => {
      this.setStatus('closed');
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will handle reconnect
    };
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    this.setStatus('closed');
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
