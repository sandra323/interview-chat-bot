import type { WebSocket } from 'ws';

export interface ConnectionState {
  connectionId: string;
  /** 绑定的会话，用于 resume/fan-out；通过 hello/chat 设置 */
  conversationId: string | null;
  ws: WebSocket;
  /** 客户端发送有效的 `{ type: 'auth', token }` 之前为 false */
  authenticated: boolean;
  /** WebSocket 认证成功后的 auth_sessions.id */
  sessionId: string | null;
  /** 若认证始终未到达则关闭 socket 的定时器 */
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

  /** 启动（或重启）未认证连接的认证截止时间。 */
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

  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }

  getConnectionsForConversation(conversationId: string): ConnectionState[] {
    return this.getAllConnections().filter(
      (c) => c.conversationId === conversationId,
    );
  }
}
