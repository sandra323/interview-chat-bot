import {
  getModelTimeoutMs,
  type ChatMessage,
  type LLMConfig,
  type ReplyEndReason,
  type ServerMessage,
} from '@ai-chat/shared';
import { OpenAICompatibleAdapter } from '../adapters/openaiCompatible.js';
import { LLMAdapterError } from '../adapters/types.js';
import { getChatStore, type ChatStore } from '../store/chatStore.js';
import type { ConnectionManager } from '../websocket/connectionManager.js';
import { logger } from '../utils/logger.js';

interface RunningJob {
  generationId: string;
  conversationId: string;
  controller: AbortController;
  promise: Promise<void>;
}

function sendToWs(
  ws: { readyState: number; OPEN: number; send: (data: string) => void },
  message: ServerMessage,
): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export class GenerationRunner {
  private jobs = new Map<string, RunningJob>();
  private adapter = new OpenAICompatibleAdapter();

  constructor(
    private readonly store: ChatStore = getChatStore(),
    private readonly connections: ConnectionManager,
  ) {}

  isRunning(generationId: string): boolean {
    return this.jobs.has(generationId);
  }

  start(params: {
    conversationId: string;
    generationId: string;
    llmMessages: ChatMessage[];
    config: LLMConfig;
  }): void {
    const { conversationId, generationId, llmMessages, config } = params;
    if (this.jobs.has(generationId)) return;

    const controller = new AbortController();
    const promise = this.runJob({
      conversationId,
      generationId,
      llmMessages,
      config,
      controller,
    }).finally(() => {
      this.jobs.delete(generationId);
    });

    this.jobs.set(generationId, {
      generationId,
      conversationId,
      controller,
      promise,
    });
  }

  stop(generationId: string): boolean {
    const job = this.jobs.get(generationId);
    if (!job) {
      const record = this.store.getGeneration(generationId);
      return Boolean(record && record.status === 'running');
    }
    job.controller.abort();
    return true;
  }

  /** Stop any running generation for a conversation (e.g. clear / delete chat). */
  stopConversation(conversationId: string): string | null {
    for (const job of this.jobs.values()) {
      if (job.conversationId === conversationId) {
        job.controller.abort();
        return job.generationId;
      }
    }
    const running = this.store.getRunningGeneration(conversationId);
    if (!running) return null;
    this.stop(running.id);
    return running.id;
  }

  private broadcast(conversationId: string, message: ServerMessage): void {
    for (const connection of this.connections.getConnectionsForConversation(
      conversationId,
    )) {
      sendToWs(connection.ws, message);
    }
  }

  private async runJob(params: {
    conversationId: string;
    generationId: string;
    llmMessages: ChatMessage[];
    config: LLMConfig;
    controller: AbortController;
  }): Promise<void> {
    const { conversationId, generationId, llmMessages, config, controller } =
      params;
    const startTime = Date.now();
    const timeoutMs = getModelTimeoutMs(config.model);

    try {
      for await (const delta of this.adapter.chatStream(llmMessages, config, {
        timeoutMs,
        extraBody: { thinking: { type: 'disabled' } },
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;

        const appended = this.store.appendGenerationContent(generationId, delta);
        if (!appended) break;

        this.broadcast(conversationId, {
          type: 'reply_delta',
          conversationId,
          generationId,
          messageId: generationId,
          delta,
          offset: appended.offset,
        });
      }

      if (controller.signal.aborted) {
        this.finish(conversationId, generationId, 'cancelled');
        logger.info('LLM generation cancelled', {
          conversationId,
          generationId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      this.finish(conversationId, generationId, 'completed');
      logger.info('LLM generation completed', {
        conversationId,
        generationId,
        durationMs: Date.now() - startTime,
        model: config.model,
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        this.finish(conversationId, generationId, 'cancelled');
        logger.info('LLM generation cancelled', {
          conversationId,
          generationId,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : '哎呀，页面开小差了，请稍后重试';
      const errorCode =
        error instanceof LLMAdapterError ? error.code : 'LLM_API_ERROR';

      this.store.finalizeGeneration(generationId, 'error', {
        error: errorMessage,
        persistAssistant: false,
      });

      this.broadcast(conversationId, {
        type: 'generation_error',
        conversationId,
        generationId,
        code: errorCode,
        message: errorMessage,
      });

      logger.error('LLM generation failed', {
        conversationId,
        generationId,
        durationMs: Date.now() - startTime,
        code: errorCode,
      });
    }
  }

  private finish(
    conversationId: string,
    generationId: string,
    reason: ReplyEndReason,
  ): void {
    const before = this.store.getGeneration(generationId);
    if (!before || before.status !== 'running') {
      return;
    }

    const status = reason === 'completed' ? 'completed' : 'cancelled';
    const finalized = this.store.finalizeGeneration(generationId, status, {
      persistAssistant: true,
    });
    const content = finalized?.contentBuffer ?? before.contentBuffer;

    this.broadcast(conversationId, {
      type: 'reply_end',
      conversationId,
      generationId,
      messageId: generationId,
      content,
      reason,
    });
  }
}
