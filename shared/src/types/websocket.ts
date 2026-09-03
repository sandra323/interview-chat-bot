import type { ScenarioId } from './scenario.js';

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

export type ToolEventName = 'start' | 'end' | 'error';

export type ReplyEndReason = 'completed' | 'cancelled';

/**
 * 客户端 → 服务端。不含 API Key — 凭据仅存在于服务端。
 * `model` 为可选的白名单偏好（非机密）。
 * 认证：在 `connected` 之后，客户端须在发起聊天前发送 `{ type: 'auth', token }`。
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
      /** 客户端已持有的本 generation 字符数 */
      offset?: number;
    }
  | { type: 'stop'; conversationId: string; generationId: string }
  | {
      type: 'set_scenario';
      conversationId?: string;
      scenario: ScenarioId;
    }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'connected'; connectionId: string }
  /** 客户端 `auth` 消息通过后的会话确认 */
  | { type: 'auth_ok' }
  /** 绑定的对话；客户端重置为空白新聊天时为 null */
  | { type: 'session'; conversationId: string | null; scenario: ScenarioId }
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
      /** 与 generationId 相同 — 为兼容现有客户端而保留 */
      messageId: string;
    }
  | {
      type: 'reply_delta';
      conversationId: string;
      generationId: string;
      messageId: string;
      delta: string;
      /** 追加本 delta 前的缓冲区长度 */
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
  /** 工具执行进度：前端据此渲染"正在检索知识库…"等状态行 */
  | {
      type: 'tool_event';
      conversationId: string;
      generationId: string;
      messageId: string;
      event: ToolEventName;
      name: string;
    }
  | { type: 'error'; code: ErrorCode; message: string };

export type ConnectionStatus = 'connecting' | 'open' | 'closed';
