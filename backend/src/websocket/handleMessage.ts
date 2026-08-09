import {
  getModelTimeoutMs,
  type ClientMessage,
  type ServerMessage,
} from '@ai-chat/shared';
import type { ConnectionState } from './connectionManager.js';
import type { ConnectionManager } from './connectionManager.js';
import { OpenAICompatibleAdapter } from '../adapters/openaiCompatible.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

const adapter = new OpenAICompatibleAdapter();
const rateLimiter = new RateLimiter(10, 60_000);
const MAX_CONTENT_LENGTH = 10_000;

function sendMessage(ws: ConnectionState['ws'], message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

export async function handleMessage(
  raw: string,
  connection: ConnectionState,
  _manager: ConnectionManager,
): Promise<void> {
  const message = parseClientMessage(raw);

  if (!message) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: '哎呀，消息格式开小差了，请稍后重试',
    });
    return;
  }

  if (message.type === 'ping') {
    return;
  }

  if (message.type === 'chat') {
    await handleChatMessage(message, connection);
  }
}

async function handleChatMessage(
  message: Extract<ClientMessage, { type: 'chat' }>,
  connection: ConnectionState,
): Promise<void> {
  const { content, config } = message;

  if (!config?.apiUrl || !config?.apiKey) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_CONFIG',
      message: '哎呀，还没配置好 API 信息，请先在设置里填完整',
    });
    return;
  }

  const trimmedContent = content?.trim() ?? '';
  if (!trimmedContent) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: '哎呀，消息内容不能为空哦',
    });
    return;
  }

  if (trimmedContent.length > MAX_CONTENT_LENGTH) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: '哎呀，消息有点太长了，请缩短后再试',
    });
    return;
  }

  if (connection.isProcessing) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'ALREADY_PROCESSING',
      message: '哎呀，上一条还在处理中，请稍后再发',
    });
    return;
  }

  if (!rateLimiter.tryConsume(connection.connectionId)) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'RATE_LIMITED',
      message: '哎呀，发送有点太频繁了，请稍后再试',
    });
    return;
  }

  connection.isProcessing = true;
  connection.messages.push({ role: 'user', content: trimmedContent });

  const startTime = Date.now();
  const timeoutMs = getModelTimeoutMs(config.model);

  try {
    const replyContent = await adapter.chat(connection.messages, config, {
      timeoutMs,
    });
    const messageId = crypto.randomUUID();

    connection.messages.push({ role: 'assistant', content: replyContent });

    sendMessage(connection.ws, {
      type: 'reply',
      content: replyContent,
      messageId,
    });

    logger.info('LLM call succeeded', {
      connectionId: connection.connectionId,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : '哎呀，页面开小差了，请稍后重试';
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code: string }).code
        : 'LLM_API_ERROR';

    sendMessage(connection.ws, {
      type: 'error',
      code: errorCode as ServerMessage extends { type: 'error' }
        ? ServerMessage['code']
        : never,
      message: errorMessage,
    });

    logger.error('LLM call failed', {
      connectionId: connection.connectionId,
      durationMs: Date.now() - startTime,
      code: errorCode,
    });
  } finally {
    connection.isProcessing = false;
  }
}
