import type { WebSocket } from 'ws';

export interface ConnectionState {
  connectionId: string;
  /** Bound conversation for resume/fan-out; set via hello/chat */
  conversationId: string | null;
  ws: WebSocket;
  /** False until client sends a valid `{ type: 'auth', token }` */
  authenticated: boolean;
  /** auth_sessions.id after successful WS auth */
  sessionId: string | null;
  /** Timer that closes the socket if auth never arrives */
  authDeadlineTimer: ReturnType<typeof setTimeout> | null;
}

const AUTH_DEADLINE_MS = 5_000;

export class ConnectionManager {
  private connections = new Map<string, ConnectionState>();

  addConnection(ws: WebSocket): ConnectionState {
    const connectionId = crypto.randomUUID();
    const state: ConnectionState = {
      connectionId,
      conversationId: null,
      ws,
      authenticated: false,
      sessionId: null,
      authDeadlineTimer: null,
    };
    this.connections.set(connectionId, state);
    return state;
  }

  /** Start (or restart) the unauthenticated auth deadline. */
  armAuthDeadline(
    connection: ConnectionState,
    onTimeout: () => void,
    ms: number = AUTH_DEADLINE_MS,
  ): void {
    this.clearAuthDeadline(connection);
    connection.authDeadlineTimer = setTimeout(onTimeout, ms);
  }

  clearAuthDeadline(connection: ConnectionState): void {
    if (connection.authDeadlineTimer) {
      clearTimeout(connection.authDeadlineTimer);
      connection.authDeadlineTimer = null;
    }
  }

  removeConnection(connectionId: string): void {
    const existing = this.connections.get(connectionId);
    if (existing) {
      this.clearAuthDeadline(existing);
    }
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
