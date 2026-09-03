import type { ErrorCode } from '@ai-chat/shared';

export class LLMAdapterError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'LLMAdapterError';
    this.code = code;
  }
}

/**
 * 可选聊天请求参数。
 * - timeoutMs：pro / thinking 模型可使用更长窗口
 * - extraBody：厂商扩展字段（如 DeepSeek thinking）
 * - signal：外部中止（用户停止）；与空闲超时组合使用
 */
export interface ChatRequestOptions {
  timeoutMs?: number;
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LLMAdapter {
  chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    config: { apiUrl: string; apiKey: string; model: string },
    options?: ChatRequestOptions,
  ): Promise<string>;

  chatStream(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    config: { apiUrl: string; apiKey: string; model: string },
    options?: ChatRequestOptions,
  ): AsyncIterable<string>;
}
