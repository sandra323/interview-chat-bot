import type { WebSocket } from 'ws';
import type { ChatMessage } from '@ai-chat/shared';

export interface ConnectionState {
  connectionId: string;
  messages: ChatMessage[];
  isProcessing: boolean;
  ws: WebSocket;
}

export class ConnectionManager {
  private connections = new Map<string, ConnectionState>();

  addConnection(ws: WebSocket): ConnectionState {
    const connectionId = crypto.randomUUID();
    const state: ConnectionState = {
      connectionId,
      messages: [],
      isProcessing: false,
      ws,
    };
    this.connections.set(connectionId, state);
    return state;
  }

  removeConnection(connectionId: string): void {
    const state = this.connections.get(connectionId);
    if (state) {
      state.messages = [];
    }
    this.connections.delete(connectionId);
  }

  getConnection(connectionId: string): ConnectionState | undefined {
    return this.connections.get(connectionId);
  }

  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }
}
