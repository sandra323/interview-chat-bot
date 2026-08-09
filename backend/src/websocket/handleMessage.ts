import type { ClientMessage, ServerMessage } from '@ai-chat/shared';
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
      message: 'Invalid message format',
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
      message: 'API URL and API key are required',
    });
    return;
  }

  const trimmedContent = content?.trim() ?? '';
  if (!trimmedContent) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Message content cannot be empty',
    });
    return;
  }

  if (trimmedContent.length > MAX_CONTENT_LENGTH) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: `Message exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
    });
    return;
  }

  if (connection.isProcessing) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'ALREADY_PROCESSING',
      message: 'Please wait for the current request to complete',
    });
    return;
  }

  if (!rateLimiter.tryConsume(connection.connectionId)) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded. Please wait before sending more messages.',
    });
    return;
  }

  connection.isProcessing = true;
  connection.messages.push({ role: 'user', content: trimmedContent });

  const startTime = Date.now();

  try {
    const replyContent = await adapter.chat(connection.messages, config);
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
      error instanceof Error ? error.message : 'Unknown error occurred';
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
