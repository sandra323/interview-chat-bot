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
 * Optional chat options.
 * - timeoutMs: longer windows for pro / thinking models
 * - extraBody: vendor fields (e.g. DeepSeek thinking)
 * - signal: external abort (user stop); combined with idle timeout
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
