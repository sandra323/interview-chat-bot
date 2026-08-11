export type ErrorCode =
  | 'INVALID_CONFIG'
  | 'LLM_API_ERROR'
  | 'NETWORK_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'ALREADY_PROCESSING'
  | 'RATE_LIMITED'
  | 'INVALID_MESSAGE'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED';

export type ReplyEndReason = 'completed' | 'cancelled';

/**
 * Client → server. No API keys — credentials live only on the server.
 * `model` is an optional allowlisted preference (non-secret).
 * Auth: after `connected`, client must send `{ type: 'auth', token }` before chat.
 */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | {
      type: 'chat';
      content: string;
      model?: string;
      conversationId?: string;
    }
  | { type: 'hello'; conversationId?: string }
  | {
      type: 'resume';
      conversationId: string;
      generationId?: string;
      /** Characters already held by the client for this generation */
      offset?: number;
    }
  | { type: 'stop'; conversationId: string; generationId: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'connected'; connectionId: string }
  /** Session accepted after client `auth` message */
  | { type: 'auth_ok' }
  /** Bound conversation, or null when the client reset to a blank new chat */
  | { type: 'session'; conversationId: string | null }
  | {
      type: 'reply';
      content: string;
      messageId: string;
      conversationId: string;
      generationId: string;
    }
  | {
      type: 'reply_start';
      conversationId: string;
      generationId: string;
      /** Same as generationId — kept for existing clients */
      messageId: string;
    }
  | {
      type: 'reply_delta';
      conversationId: string;
      generationId: string;
      messageId: string;
      delta: string;
      /** Buffer length before this delta was appended */
      offset: number;
    }
  | {
      type: 'reply_end';
      conversationId: string;
      generationId: string;
      messageId: string;
      content: string;
      reason: ReplyEndReason;
    }
  | {
      type: 'reply_catchup';
      conversationId: string;
      generationId: string;
      content: string;
      offset: number;
      done: boolean;
      reason?: ReplyEndReason;
    }
  | {
      type: 'generation_error';
      conversationId: string;
      generationId: string;
      code: ErrorCode;
      message: string;
    }
  | { type: 'error'; code: ErrorCode; message: string };

export type ConnectionStatus = 'connecting' | 'open' | 'closed';
