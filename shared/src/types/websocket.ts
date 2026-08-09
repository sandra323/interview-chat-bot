import type { Config } from './config.js';

export type ErrorCode =
  | 'INVALID_CONFIG'
  | 'LLM_API_ERROR'
  | 'NETWORK_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'ALREADY_PROCESSING'
  | 'RATE_LIMITED'
  | 'INVALID_MESSAGE'
  | 'INTERNAL_ERROR';

export type ClientMessage =
  | { type: 'chat'; content: string; config: Config }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'connected'; connectionId: string }
  | { type: 'reply'; content: string; messageId: string }
  | { type: 'error'; code: ErrorCode; message: string };

export type ConnectionStatus = 'connecting' | 'open' | 'closed';
