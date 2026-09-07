import {
  getModelTimeoutMs,
  type ChatMessage,
  type LLMConfig,
  type ReplyEndReason,
  type ServerMessage,
} from '@ai-chat/shared';
import { streamAgentReply } from '../agent/streamAgentReply.js';
import { getAuthSessionStore } from '../auth/sessionStore.js';
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
  /**
   * 当前进程中正在执行的生成任务。
   * key 是 generationId，保存任务的取消控制器和异步执行状态；任务结束后会自动移除。
   */
  private jobs = new Map<string, RunningJob>();

  /**
   * 创建生成任务调度器。
   * store 负责持久化会话、消息和生成状态，connections 负责查找需要接收消息的 WebSocket 连接。
   * store 提供默认值，方便生产环境使用单例，也方便测试时注入临时数据库。
   */
  constructor(
    /** 聊天数据仓库，用于读写生成状态、增量内容和最终助手消息。 */
    private readonly store: ChatStore = getChatStore(),
    /** WebSocket 连接管理器，用于查找绑定到某个会话的所有在线连接。 */
    private readonly connections: ConnectionManager,
  ) {}

  /**
   * 启动一次后台生成任务，但不等待任务完成。
   * 为任务创建 AbortController，调用 runJob 执行智能体，并把任务登记到 jobs 中。
   * 如果相同 generationId 已在运行，则直接忽略，避免重复生成。
   */
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

  /**
   * 根据 generationId 停止一个生成任务。
   * 内存中存在任务时发送取消信号；不存在时检查数据库，以兼容进程重启后遗留的运行记录。
   * 返回值表示该生成任务是否处于可停止的运行状态。
   */
  stop(generationId: string): boolean {
    const job = this.jobs.get(generationId);
    if (!job) {
      const record = this.store.getGeneration(generationId);
      return Boolean(record && record.status === 'running');
    }
    job.controller.abort();
    return true;
  }

  /**
   * 停止指定会话中正在执行的生成任务，例如清空或删除会话时使用。
   * 优先取消当前进程中的任务；如果内存中没有，则尝试处理数据库里的运行记录。
   * 返回被停止的 generationId；没有运行任务时返回 null。
   */
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

  /**
   * 向当前绑定到指定会话的所有有效 WebSocket 连接广播服务端消息。
   * 广播前会再次检查登录会话，跳过未认证连接，并关闭登录已撤销或已过期的连接。
   */
  private broadcast(conversationId: string, message: ServerMessage): void {
    const store = getAuthSessionStore();
    for (const connection of this.connections.getConnectionsForConversation(
      conversationId,
    )) {
      // 不向未认证、会话已撤销或已过期的连接广播消息，例如用户在其他位置
      // 重新登录，或者在另一个浏览器标签页中退出登录的情况。
      if (!connection.authenticated || !connection.sessionId) {
        continue;
      }
      if (!store.findValidById(connection.sessionId)) {
        connection.authenticated = false;
        connection.sessionId = null;
        connection.username = null;
        if (connection.ws.readyState === connection.ws.OPEN) {
          connection.ws.send(
            JSON.stringify({
              type: 'error',
              code: 'UNAUTHORIZED',
              message: '登录已过期，请重新登录',
            } satisfies ServerMessage),
          );
          connection.ws.close();
        }
        continue;
      }
      sendToWs(connection.ws, message);
    }
  }

  /**
   * 执行一次完整的智能体生成任务，是本类的核心工作方法。
   * 它消费智能体产生的文本增量，将内容持续写入数据库并广播给前端；同时统一处理
   * 正常完成、用户取消、超时和模型异常，并记录任务耗时日志。
   */
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
      for await (const delta of streamAgentReply({
        messages: llmMessages,
        config,
        timeoutMs,
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
      const errorCode = 'LLM_API_ERROR';

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

  /**
   * 收尾一个正常完成或被取消的生成任务。
   * 将数据库中的 generation 状态改为 completed/cancelled，把已生成内容保存成助手消息，
   * 最后向前端广播 reply_end。已经结束的任务不会被重复处理。
   */
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
