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

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      /** 启用 thinking 模式时存在；用户可见回复文本中忽略。 */
      reasoning_content?: string | null;
    };
  }>;
}

function mapFetchError(error: unknown): never {
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
}

/**
 * OpenAI 兼容的 Chat Completions 适配器（DeepSeek、OpenAI 等）。
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
          // 强制非流式；chat() 无法消费 SSE 响应。
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // 厂商细节仅写日志；面向用户的文案保持友好。
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
      mapFetchError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *chatStream(
    messages: ChatMessage[],
    config: LLMConfig,
    options?: ChatRequestOptions,
  ): AsyncGenerator<string> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const external = options?.signal;
    const onExternalAbort = () => controller.abort();
    if (external) {
      if (external.aborted) {
        clearTimeout(timeoutId);
        const abortError = new Error('Generation cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }
      external.addEventListener('abort', onExternalAbort, { once: true });
    }

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
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error('LLM API stream error', {
          status: response.status,
          body: errorText.slice(0, 200),
        });
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          '哎呀，模型服务开小差了，请稍后重试',
        );
      }

      if (!response.body) {
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          '哎呀，模型回复读不懂了，请稍后重试',
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let yieldedContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // token 持续到达时重置空闲超时
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            if (!yieldedContent) {
              throw new LLMAdapterError(
                'LLM_API_ERROR',
                '哎呀，模型回复读不懂了，请稍后重试',
              );
            }
            return;
          }

          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(payload) as OpenAIStreamChunk;
          } catch {
            logger.error('LLM stream chunk parse failed', {
              payload: payload.slice(0, 200),
            });
            continue;
          }

          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            yieldedContent = true;
            yield delta;
          }
        }
      }

      if (!yieldedContent) {
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          '哎呀，模型回复读不懂了，请稍后重试',
        );
      }
    } catch (error) {
      if (external?.aborted) {
        const abortError = new Error('Generation cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }
      mapFetchError(error);
    } finally {
      clearTimeout(timeoutId);
      external?.removeEventListener('abort', onExternalAbort);
    }
  }
}
