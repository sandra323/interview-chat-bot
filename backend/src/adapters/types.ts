import type { ErrorCode } from '@ai-chat/shared';

export class LLMAdapterError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'LLMAdapterError';
    this.code = code;
  }
}

export interface LLMAdapter {
  chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    config: { apiUrl: string; apiKey: string; model: string },
  ): Promise<string>;
}
