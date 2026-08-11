import {
  isAllowedModelId,
  resolveAllowedModel,
  type ClientMessage,
  type ServerMessage,
} from '@ai-chat/shared';
import type { ConnectionState } from './connectionManager.js';
import type { ConnectionManager } from './connectionManager.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';
import { buildLlmConfig, readServerEnv } from '../config/env.js';
import { getChatStore } from '../store/chatStore.js';
import { getAuthSessionStore } from '../auth/sessionStore.js';
import { resolveBearerSession } from '../auth/resolveSession.js';
import type { GenerationRunner } from '../generation/generationRunner.js';

const rateLimiter = new RateLimiter(10, 60_000);
const MAX_CONTENT_LENGTH = 10_000;

function sendMessage(ws: ConnectionState['ws'], message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function closeUnauthorized(
  connection: ConnectionState,
  manager: ConnectionManager,
  msg: string,
): void {
  manager.clearAuthDeadline(connection);
  sendMessage(connection.ws, {
    type: 'error',
    code: 'UNAUTHORIZED',
    message: msg,
  });
  connection.ws.close();
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    const msg = parsed as Record<string, unknown>;
    if ('config' in msg || 'apiKey' in msg) {
      return null;
    }
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

function handleAuth(
  message: Extract<ClientMessage, { type: 'auth' }>,
  connection: ConnectionState,
  manager: ConnectionManager,
): void {
  const token =
    typeof message.token === 'string' ? message.token.trim() : '';
  const result = resolveBearerSession(token || null);

  if (!result.ok) {
    logger.warn('WS auth failed', {
      connectionId: connection.connectionId,
      reason: 'credentials',
    });
    closeUnauthorized(connection, manager, result.msg);
    return;
  }

  connection.authenticated = true;
  connection.sessionId = result.auth.sessionId;
  manager.clearAuthDeadline(connection);
  logger.info('WS auth success', {
    connectionId: connection.connectionId,
    username: result.auth.username,
  });
  sendMessage(connection.ws, { type: 'auth_ok' });
}

/** Ensure still authenticated and session not expired/revoked. */
function ensureAuthenticated(
  connection: ConnectionState,
  manager: ConnectionManager,
): boolean {
  if (!connection.authenticated || !connection.sessionId) {
    closeUnauthorized(connection, manager, '请先登录');
    return false;
  }
  const session = getAuthSessionStore().findValidById(connection.sessionId);
  if (!session) {
    connection.authenticated = false;
    connection.sessionId = null;
    closeUnauthorized(connection, manager, '登录已过期，请重新登录');
    return false;
  }
  return true;
}

export async function handleMessage(
  raw: string,
  connection: ConnectionState,
  manager: ConnectionManager,
  runner: GenerationRunner,
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

  if (message.type === 'auth') {
    handleAuth(message, connection, manager);
    return;
  }

  if (!ensureAuthenticated(connection, manager)) {
    return;
  }

  if (message.type === 'hello') {
    handleHello(message, connection);
    return;
  }

  if (message.type === 'resume') {
    handleResume(message, connection, runner);
    return;
  }

  if (message.type === 'stop') {
    handleStop(message, connection, runner);
    return;
  }

  if (message.type === 'chat') {
    await handleChatMessage(message, connection, runner);
  }
}

function handleHello(
  message: Extract<ClientMessage, { type: 'hello' }>,
  connection: ConnectionState,
): void {
  const store = getChatStore();

  // No conversationId → unbind for a blank new chat; do NOT create an empty row
  if (!message.conversationId) {
    connection.conversationId = null;
    sendMessage(connection.ws, { type: 'session', conversationId: null });
    return;
  }

  const conversationId = store.ensureConversation(message.conversationId);
  connection.conversationId = conversationId;
  sendMessage(connection.ws, { type: 'session', conversationId });
}

function handleResume(
  message: Extract<ClientMessage, { type: 'resume' }>,
  connection: ConnectionState,
  runner: GenerationRunner,
): void {
  const store = getChatStore();
  if (!store.conversationExists(message.conversationId)) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'NOT_FOUND',
      message: '哎呀，找不到这个会话了，请新建对话',
    });
    return;
  }

  connection.conversationId = message.conversationId;
  sendMessage(connection.ws, {
    type: 'session',
    conversationId: message.conversationId,
  });

  const generationId =
    message.generationId ??
    store.getRunningGeneration(message.conversationId)?.id;

  if (!generationId) {
    return;
  }

  const generation = store.getGeneration(generationId);
  if (!generation || generation.conversationId !== message.conversationId) {
    sendMessage(connection.ws, {
      type: 'generation_error',
      conversationId: message.conversationId,
      generationId,
      code: 'NOT_FOUND',
      message: '哎呀，找不到这条回复了',
    });
    return;
  }

  const offset = Math.max(0, message.offset ?? 0);
  const tail = generation.contentBuffer.slice(offset);
  const done = generation.status !== 'running';

  sendMessage(connection.ws, {
    type: 'reply_catchup',
    conversationId: message.conversationId,
    generationId,
    content: tail,
    offset,
    done,
    reason:
      generation.status === 'completed'
        ? 'completed'
        : generation.status === 'cancelled'
          ? 'cancelled'
          : undefined,
  });

  if (generation.status === 'error') {
    sendMessage(connection.ws, {
      type: 'generation_error',
      conversationId: message.conversationId,
      generationId,
      code: 'LLM_API_ERROR',
      message: generation.error ?? '哎呀，模型服务开小差了，请稍后重试',
    });
  }

  // Live deltas fan-out via conversationId binding; runner kept for API symmetry
  void runner;
}

function handleStop(
  message: Extract<ClientMessage, { type: 'stop' }>,
  connection: ConnectionState,
  runner: GenerationRunner,
): void {
  const store = getChatStore();
  const generation = store.getGeneration(message.generationId);
  if (!generation || generation.conversationId !== message.conversationId) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'NOT_FOUND',
      message: '哎呀，没有正在进行的生成任务',
    });
    return;
  }

  connection.conversationId = message.conversationId;

  if (generation.status !== 'running') {
    sendMessage(connection.ws, {
      type: 'reply_end',
      conversationId: message.conversationId,
      generationId: message.generationId,
      messageId: message.generationId,
      content: generation.contentBuffer,
      reason: generation.status === 'cancelled' ? 'cancelled' : 'completed',
    });
    return;
  }

  const stopped = runner.stop(message.generationId);
  if (!stopped) {
    // Orphaned running row (e.g. after restart) — finalize locally
    store.finalizeGeneration(message.generationId, 'cancelled', {
      persistAssistant: true,
    });
    sendMessage(connection.ws, {
      type: 'reply_end',
      conversationId: message.conversationId,
      generationId: message.generationId,
      messageId: message.generationId,
      content: generation.contentBuffer,
      reason: 'cancelled',
    });
  }
}

async function handleChatMessage(
  message: Extract<ClientMessage, { type: 'chat' }>,
  connection: ConnectionState,
  runner: GenerationRunner,
): Promise<void> {
  const env = readServerEnv();
  if (!env.llmApiKey) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_CONFIG',
      message: '哎呀，服务端还没配置好模型密钥，请联系管理员',
    });
    return;
  }

  if (message.model !== undefined && !isAllowedModelId(message.model)) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: '哎呀，这个模型暂时不可用，请换一个再试',
    });
    return;
  }

  const model = resolveAllowedModel(message.model ?? env.defaultModel);
  const config = buildLlmConfig(env, model);
  const store = getChatStore();

  const trimmedContent = message.content?.trim() ?? '';
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

  if (!rateLimiter.tryConsume(connection.connectionId)) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'RATE_LIMITED',
      message: '哎呀，发送有点太频繁了，请稍后再试',
    });
    return;
  }

  const conversationId = store.ensureConversation(
    message.conversationId ?? connection.conversationId ?? undefined,
  );
  connection.conversationId = conversationId;

  const running = store.getRunningGeneration(conversationId);
  if (running) {
    sendMessage(connection.ws, {
      type: 'error',
      code: 'ALREADY_PROCESSING',
      message: '哎呀，上一条还在处理中，请先停止或稍后再发',
    });
    return;
  }

  sendMessage(connection.ws, { type: 'session', conversationId });

  store.appendMessage(conversationId, 'user', trimmedContent);
  const generationId = crypto.randomUUID();
  store.createGeneration(conversationId, generationId);

  const llmMessages = store.listChatMessages(conversationId);

  sendMessage(connection.ws, {
    type: 'reply_start',
    conversationId,
    generationId,
    messageId: generationId,
  });

  runner.start({
    conversationId,
    generationId,
    llmMessages,
    config,
  });

  logger.info('LLM generation started', {
    connectionId: connection.connectionId,
    conversationId,
    generationId,
    model: config.model,
  });
}
