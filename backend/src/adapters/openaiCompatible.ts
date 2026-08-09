import {
  DEFAULT_LLM_TIMEOUT_MS,
  type ChatMessage,
  type LLMConfig,
} from '@ai-chat/shared';
import {
  LLMAdapterError,
  type ChatRequestOptions,
  type LLMAdapter,
} from './types.js';
import { logger } from '../utils/logger.js';

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * OpenAI-compatible Chat Completions adapter (DeepSeek, OpenAI, etc.).
 * Phase 2 can add chatStream() here and pass extraBody for thinking mode.
 */
export class OpenAICompatibleAdapter implements LLMAdapter {
  async chat(
    messages: ChatMessage[],
    config: LLMConfig,
    options?: ChatRequestOptions,
  ): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          ...(options?.extraBody ?? {}),
          // Enforce non-streaming; chat() cannot consume SSE responses.
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // Keep provider details in logs only; user-facing copy stays friendly.
        logger.error('LLM API error', {
          status: response.status,
          body: errorText.slice(0, 200),
        });
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          '哎呀，模型服务开小差了，请稍后重试',
        );
      }

      const data = (await response.json()) as OpenAIChatResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          '哎呀，模型回复读不懂了，请稍后重试',
        );
      }

      return content;
    } catch (error) {
      if (error instanceof LLMAdapterError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMAdapterError(
          'REQUEST_TIMEOUT',
          '哎呀，等待超时了，请稍后重试',
        );
      }

      throw new LLMAdapterError(
        'NETWORK_ERROR',
        '哎呀，网络开小差了，请稍后重试',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
