import {
  DEFAULT_SCENARIO_ID,
  isAllowedModelId,
  KNOWLEDGE_BASE_SEARCH_TOOL,
  resolveAllowedModel,
  type ChatMessage,
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
import { buildRagMessages } from '../rag/buildRagMessages.js';
import {
  libraryRefusalText,
  type LibraryRefusalReason,
} from '../rag/libraryRefusal.js';
import { isKnowledgeBaseId } from '../rag/retrievalQuery.js';
import {
  RetrievalAbortedError,
  lookupKnowledgeBaseForOwner,
  retrieveForChat,
  type RetrieveForChatResult,
} from '../rag/retrieveForChat.js';

const rateLimiter = new RateLimiter(10, 60_000);
const MAX_CONTENT_LENGTH = 10_000;
const pendingRetrievals = new Map<string, AbortController>();

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
      reason: result.reason,
    });
    closeUnauthorized(connection, manager, result.msg);
    return;
  }

  connection.authenticated = true;
  connection.sessionId = result.auth.sessionId;
  connection.username = result.auth.username;
  manager.clearAuthDeadline(connection);
  logger.info('WS auth success', {
    connectionId: connection.connectionId,
    username: result.auth.username,
  });
  sendMessage(connection.ws, { type: 'auth_ok' });
}

/** 确认仍处于已认证状态且会话未过期/未撤销。 */
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
    connection.username = null;
    closeUnauthorized(connection, manager, '登录已过期，请重新登录');
    return false;
  }
  connection.username = session.username;
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

  // 无 conversationId → 解绑以开启空白新会话；不要创建空行
  if (!message.conversationId) {
    connection.conversationId = null;
    sendMessage(connection.ws, {
      type: 'session',
      conversationId: null,
      scenario: DEFAULT_SCENARIO_ID,
    });
    return;
  }

  const conversationId = store.ensureConversation(message.conversationId);
  connection.conversationId = conversationId;
  sendMessage(connection.ws, {
    type: 'session',
    conversationId,
    scenario: DEFAULT_SCENARIO_ID,
  });
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
    scenario: DEFAULT_SCENARIO_ID,
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

  // 实时增量通过 conversationId 绑定 fan-out；保留 runner 引用以保持 API 对称
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

  const wasRetrieving = abortPendingRetrieval(message.generationId);
  if (wasRetrieving) {
    store.finalizeGeneration(message.generationId, 'cancelled', {
      persistAssistant: false,
    });
    sendMessage(connection.ws, {
      type: 'reply_end',
      conversationId: message.conversationId,
      generationId: message.generationId,
      messageId: message.generationId,
      content: '',
      reason: 'cancelled',
    });
    return;
  }

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
    // 孤立的 running 行（如重启后）——在本地收尾
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

  sendMessage(connection.ws, {
    type: 'session',
    conversationId,
    scenario: DEFAULT_SCENARIO_ID,
  });

  store.appendMessage(conversationId, 'user', trimmedContent);
  const generationId = crypto.randomUUID();
  store.createGeneration(conversationId, generationId);

  const ownerUsername = connection.username;
  const boundId = await resolveBoundKnowledgeBaseId({
    conversationId,
    ownerUsername,
    clientKnowledgeBaseId: message.knowledgeBaseId,
  });

  const retrieval = new AbortController();
  pendingRetrievals.set(generationId, retrieval);
  let ragResult: RetrieveForChatResult = { kind: 'unbound' };
  try {
    if (boundId && ownerUsername) {
      sendToolEvent(connection, {
        conversationId,
        generationId,
        event: 'start',
      });
      ragResult = await retrieveForChat({
        ownerUsername,
        knowledgeBaseId: boundId,
        query: trimmedContent,
        signal: retrieval.signal,
      });
      sendToolEvent(connection, {
        conversationId,
        generationId,
        event: ragResult.kind === 'unavailable' ? 'error' : 'end',
      });
    }
  } catch (error) {
    if (
      error instanceof RetrievalAbortedError ||
      retrieval.signal.aborted
    ) {
      return;
    }
    logger.error('Chat retrieval failed', {
      conversationId,
      generationId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    ragResult = { kind: 'unavailable', kb: null };
    sendToolEvent(connection, {
      conversationId,
      generationId,
      event: 'error',
    });
  } finally {
    pendingRetrievals.delete(generationId);
  }

  if (store.getGeneration(generationId)?.status !== 'running') {
    return;
  }

  if (ragResult.kind === 'kb_missing') {
    store.setConversationKnowledgeBaseId(conversationId, null);
  }

  const history = store.listChatMessages(conversationId);
  if (ragResult.kind === 'hits' || ragResult.kind === 'empty') {
    store.markKnowledgeBaseUsed(conversationId);
  }
  const contextRevoked =
    ragResult.kind === 'unbound' &&
    store.mustRefuseUnboundLibraryContinuation(conversationId);
  const refusalReason = libraryRefusalReason(ragResult.kind, contextRevoked);

  if (refusalReason) {
    emitFixedLibraryReply(connection, conversationId, generationId, refusalReason);
    return;
  }

  const llmMessages = applyRagToHistory(history, ragResult);

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

function libraryRefusalReason(
  kind: RetrieveForChatResult['kind'],
  contextRevoked: boolean,
): LibraryRefusalReason | null {
  if (kind === 'empty') return 'no_hit';
  if (kind === 'kb_missing' || contextRevoked) return 'gone';
  if (kind === 'unavailable') return 'unavailable';
  return null;
}

/** 不调用模型。查不到、库已删除或检索失败时，只回固定诚实文案。 */
function emitFixedLibraryReply(
  connection: ConnectionState,
  conversationId: string,
  generationId: string,
  reason: LibraryRefusalReason,
): void {
  const store = getChatStore();
  const content = libraryRefusalText(reason);
  const appended = store.appendGenerationContent(generationId, content);
  if (!appended) return;

  const finalized = store.finalizeGeneration(generationId, 'completed', {
    persistAssistant: true,
  });
  const text = finalized?.contentBuffer ?? content;

  sendMessage(connection.ws, {
    type: 'reply_start',
    conversationId,
    generationId,
    messageId: generationId,
  });
  sendMessage(connection.ws, {
    type: 'reply_delta',
    conversationId,
    generationId,
    messageId: generationId,
    delta: text,
    offset: 0,
  });
  sendMessage(connection.ws, {
    type: 'reply_end',
    conversationId,
    generationId,
    messageId: generationId,
    content: text,
    reason: 'completed',
  });
}

function abortPendingRetrieval(generationId: string): boolean {
  const controller = pendingRetrievals.get(generationId);
  if (!controller) return false;
  controller.abort();
  pendingRetrievals.delete(generationId);
  return true;
}

function sendToolEvent(
  connection: ConnectionState,
  params: {
    conversationId: string;
    generationId: string;
    event: 'start' | 'end' | 'error';
  },
): void {
  sendMessage(connection.ws, {
    type: 'tool_event',
    conversationId: params.conversationId,
    generationId: params.generationId,
    messageId: params.generationId,
    event: params.event,
    name: KNOWLEDGE_BASE_SEARCH_TOOL,
  });
}

/**
 * 以 SQLite 绑定为准；仅当库内为 NULL 时用客户端 id 懒绑定（须归属当前用户）。
 */
async function resolveBoundKnowledgeBaseId(input: {
  conversationId: string;
  ownerUsername: string | null;
  clientKnowledgeBaseId?: string;
}): Promise<string | null> {
  const store = getChatStore();
  const bound = store.getConversationKnowledgeBaseId(input.conversationId);
  const client =
    typeof input.clientKnowledgeBaseId === 'string'
      ? input.clientKnowledgeBaseId.trim()
      : '';

  if (bound) {
    if (input.ownerUsername) {
      try {
        const owned = await lookupKnowledgeBaseForOwner(
          bound,
          input.ownerUsername,
        );
        if (!owned) {
          store.setConversationKnowledgeBaseId(input.conversationId, null);
          return null;
        }
      } catch (error) {
        logger.warn('bound knowledge base lookup failed', {
          conversationId: input.conversationId,
          error: error instanceof Error ? error.message : 'unknown',
        });
        store.setConversationKnowledgeBaseId(input.conversationId, null);
        return null;
      }
    }
    if (client && client !== bound) {
      logger.warn('client knowledgeBaseId ignored; conversation binding wins', {
        conversationId: input.conversationId,
      });
    }
    return bound;
  }

  if (!client || !input.ownerUsername || !isKnowledgeBaseId(client)) {
    if (client && !isKnowledgeBaseId(client)) {
      logger.warn('ignored invalid client knowledgeBaseId', {
        conversationId: input.conversationId,
      });
    }
    return null;
  }

  try {
    const owned = await lookupKnowledgeBaseForOwner(client, input.ownerUsername);
    if (!owned) {
      logger.warn('ignored unowned client knowledgeBaseId', {
        conversationId: input.conversationId,
      });
      return null;
    }
    store.setConversationKnowledgeBaseId(input.conversationId, client);
    return client;
  } catch (error) {
    logger.warn('lazy bind knowledge base failed', {
      conversationId: input.conversationId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

function applyRagToHistory(
  history: ChatMessage[],
  result: RetrieveForChatResult,
): ChatMessage[] {
  if (result.kind === 'unbound') {
    return history;
  }
  if (result.kind === 'kb_missing') {
    return buildRagMessages({
      history,
      kbName: '',
      hits: [],
      mode: 'kb_missing',
    });
  }
  if (result.kind === 'unavailable') {
    return buildRagMessages({
      history,
      kbName: result.kb?.name ?? '',
      hits: [],
      mode: 'unavailable',
    });
  }
  if (result.kind === 'empty') {
    return buildRagMessages({
      history,
      kbName: result.kb.name,
      hits: [],
      mode: 'empty',
    });
  }
  return buildRagMessages({
    history,
    kbName: result.kb.name,
    hits: result.hits,
    mode: 'hits',
  });
}
