import type { ChatMessage, LLMConfig } from '@ai-chat/shared';
import { LLMAdapterError, type LLMAdapter } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAICompatibleAdapter implements LLMAdapter {
  async chat(messages: ChatMessage[], config: LLMConfig): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

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
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          `The server returned status ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as OpenAIChatResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new LLMAdapterError(
          'LLM_API_ERROR',
          'Invalid response format from LLM API',
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
          'LLM request timed out after 30 seconds',
        );
      }

      throw new LLMAdapterError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network request failed',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
