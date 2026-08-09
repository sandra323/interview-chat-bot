export type ErrorCode =
  | 'INVALID_CONFIG'
  | 'LLM_API_ERROR'
  | 'NETWORK_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'ALREADY_PROCESSING'
  | 'RATE_LIMITED'
  | 'INVALID_MESSAGE'
  | 'INTERNAL_ERROR';

/**
 * Client → server. No API keys — credentials live only on the server.
 * `model` is an optional allowlisted preference (non-secret).
 */
export type ClientMessage =
  | { type: 'chat'; content: string; model?: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'connected'; connectionId: string }
  | { type: 'reply'; content: string; messageId: string }
  | { type: 'error'; code: ErrorCode; message: string };

export type ConnectionStatus = 'connecting' | 'open' | 'closed';
