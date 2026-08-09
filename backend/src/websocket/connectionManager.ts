import type { WebSocket } from 'ws';

export interface ConnectionState {
  connectionId: string;
  /** Bound conversation for resume/fan-out; set via hello/chat */
  conversationId: string | null;
  ws: WebSocket;
}

export class ConnectionManager {
  private connections = new Map<string, ConnectionState>();

  addConnection(ws: WebSocket): ConnectionState {
    const connectionId = crypto.randomUUID();
    const state: ConnectionState = {
      connectionId,
      conversationId: null,
      ws,
    };
    this.connections.set(connectionId, state);
    return state;
  }

  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  getConnection(connectionId: string): ConnectionState | undefined {
    return this.connections.get(connectionId);
  }

  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }

  getConnectionsForConversation(conversationId: string): ConnectionState[] {
    return this.getAllConnections().filter(
      (c) => c.conversationId === conversationId,
    );
  }
}
