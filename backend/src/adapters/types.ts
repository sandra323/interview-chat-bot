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
 * Optional chat options — shaped for Phase 2 without enabling stream yet.
 * - timeoutMs: longer windows for pro / thinking models
 * - extraBody: vendor fields (e.g. DeepSeek thinking)
 * - stream: reserved; use chatStream() when implemented
 */
export interface ChatRequestOptions {
  timeoutMs?: number;
  extraBody?: Record<string, unknown>;
  /** Reserved for Phase 2 — adapters may ignore until streaming ships. */
  stream?: boolean;
}

export interface LLMAdapter {
  chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    config: { apiUrl: string; apiKey: string; model: string },
    options?: ChatRequestOptions,
  ): Promise<string>;

  /**
   * Phase 2: streaming tokens. Optional so existing adapters stay valid.
   * Implement as AsyncGenerator / readable stream consumer later.
   */
  chatStream?(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    config: { apiUrl: string; apiKey: string; model: string },
    options?: ChatRequestOptions,
  ): AsyncIterable<string>;
}
