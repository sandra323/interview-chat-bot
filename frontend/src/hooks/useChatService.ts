import { useCallback, useEffect, useRef } from 'react';
import type { Message, ServerMessage } from '@ai-chat/shared';
import { USE_MOCK, MOCK_REPLY_DELAY_MS } from '@/config/app';
import { generateMockReply, MOCK_INITIAL_MESSAGES } from '@/mocks/chatMock';
import { parseServerMessage } from '@/apis/websocket/messageParser';
import {
  sendChatMessage,
  sendHello,
  sendResume,
  sendStop,
} from '@/apis/websocket/chat';
import { WebSocketClient } from '@/apis/websocket/client';
import {
  fetchConversationMessages,
  HISTORY_PAGE_SIZE,
  type ConversationMessageItem,
} from '@/apis/conversations';
import { createMessage, useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import {
  alignReplyDelta,
  mergeCatchupContent,
} from '@/utils/replyStreamAlign';
import {
  discardReplyDeltaQueue,
  enqueueReplyDelta,
  flushReplyDeltaQueue,
  setReplyDeltaFlushHandler,
  type QueuedReplyDelta,
} from '@/utils/replyDeltaBatcher';
import { newId } from '@/utils/id';
import { getWebSocketUrl, isValidMessage } from '@/utils/validators';

const MOCK_CHUNK_SIZE = 4;
const MOCK_CHUNK_INTERVAL_MS = 28;

/** 等待 reply_catchup 时，限制缓冲的实时 delta 数量。 */
const CATCHUP_BUFFER_MAX_ITEMS = 100;
const CATCHUP_BUFFER_MAX_CHARS = 50_000;
/** offset 不一致时避免 resume 风暴。 */
const GAP_RESUME_COOLDOWN_MS = 1500;

/** 供消息 handler 做 gap 补全的实时 WS client（模块级）。 */
let chatClientRef: WebSocketClient | null = null;

type CatchupBufferEntry = {
  conversationId: string;
  buffer: Array<{ delta: string; offset: number }>;
  bufferedChars: number;
};

/**
 * resume 后等待 reply_catchup 的 generation —— 缓冲实时 delta，
 * 避免迟到的 catchup 与丢弃逻辑竞态。
 */
const awaitingCatchup = new Map<string, CatchupBufferEntry>();

/** 无 generationId 的 resume 对话（如切换）—— 缓冲直至 catchup。 */
const awaitingConversationCatchup = new Set<string>();

const lastGapResumeAt = new Map<string, number>();

function beginAwaitingCatchup(
  conversationId: string,
  generationId: string,
): void {
  if (awaitingCatchup.has(generationId)) return;
  awaitingCatchup.set(generationId, {
    conversationId,
    buffer: [],
    bufferedChars: 0,
  });
}

function beginAwaitingConversationCatchup(conversationId: string): void {
  awaitingConversationCatchup.add(conversationId);
}

function clearAwaitingCatchup(generationId: string): void {
  awaitingCatchup.delete(generationId);
  lastGapResumeAt.delete(generationId);
}

function clearAllCatchupState(): void {
  awaitingCatchup.clear();
  awaitingConversationCatchup.clear();
  lastGapResumeAt.clear();
  discardReplyDeltaQueue();
}

function pushCatchupBuffer(
  entry: CatchupBufferEntry,
  delta: string,
  offset: number,
): void {
  while (
    entry.buffer.length >= CATCHUP_BUFFER_MAX_ITEMS ||
    entry.bufferedChars + delta.length > CATCHUP_BUFFER_MAX_CHARS
  ) {
    const dropped = entry.buffer.shift();
    if (!dropped) break;
    entry.bufferedChars = Math.max(
      0,
      entry.bufferedChars - dropped.delta.length,
    );
  }
  entry.buffer.push({ delta, offset });
  entry.bufferedChars += delta.length;
}

function requestGapCatchup(
  conversationId: string,
  generationId: string,
  localLen: number,
): void {
  const client = chatClientRef;
  if (!client || client.getStatus() !== 'open') return;

  const now = Date.now();
  const last = lastGapResumeAt.get(generationId) ?? 0;
  const cooling = now - last < GAP_RESUME_COOLDOWN_MS;

  beginAwaitingCatchup(conversationId, generationId);
  if (cooling) {
    // 刚 resume 过（或仍在等待）—— 仅继续缓冲
    return;
  }

  lastGapResumeAt.set(generationId, now);
  sendResume(client, {
    conversationId,
    generationId,
    offset: localLen,
  });
}

/**
 * 尽可能单次写入将对齐的 delta 应用到 store。
 * 供 rAF batcher 与 catch-up flush（立即）使用。
 */
function applyAlignedReplyDeltaBatch(
  generationId: string,
  items: QueuedReplyDelta[],
): void {
  if (items.length === 0) return;

  const { messages, addMessage, updateMessage } = useChatStore.getState();
  let msg = messages.find((m) => m.id === generationId);
  let content = msg?.content ?? '';
  let dirty = false;

  const commit = () => {
    if (!dirty) return;
    if (!msg) {
      addMessage(
        createMessage('assistant', content, 'pending', generationId),
      );
      msg = useChatStore
        .getState()
        .messages.find((m) => m.id === generationId);
    } else {
      updateMessage(generationId, { content, status: 'pending' });
    }
    dirty = false;
  };

  for (let i = 0; i < items.length; i += 1) {
    const { conversationId, delta, offset } = items[i];

    if (awaitingConversationCatchup.has(conversationId)) {
      beginAwaitingCatchup(conversationId, generationId);
    }

    const pending = awaitingCatchup.get(generationId);
    if (pending) {
      commit();
      for (const rest of items.slice(i)) {
        pushCatchupBuffer(pending, rest.delta, rest.offset);
      }
      return;
    }

    const result = alignReplyDelta(content, delta, offset);

    if (result.action === 'ignore') continue;

    if (result.action === 'gap') {
      commit();
      requestGapCatchup(conversationId, generationId, content.length);
      const entry = awaitingCatchup.get(generationId);
      if (entry) {
        for (const rest of items.slice(i)) {
          pushCatchupBuffer(entry, rest.delta, rest.offset);
        }
      }
      return;
    }

    content = result.content;
    dirty = true;
  }

  commit();
}

setReplyDeltaFlushHandler(applyAlignedReplyDeltaBatch);

/** 实时路径：排队 rAF 合并；等待 catch-up 者仍立即缓冲。 */
function applyAlignedReplyDelta(
  conversationId: string,
  generationId: string,
  delta: string,
  offset: number,
): void {
  if (awaitingConversationCatchup.has(conversationId)) {
    beginAwaitingCatchup(conversationId, generationId);
  }

  const pending = awaitingCatchup.get(generationId);
  if (pending) {
    pushCatchupBuffer(pending, delta, offset);
    return;
  }

  enqueueReplyDelta(conversationId, generationId, delta, offset);
}

function flushBufferedDeltas(generationId: string): void {
  const pending = awaitingCatchup.get(generationId);
  if (!pending) return;
  const items = [...pending.buffer].sort((a, b) => a.offset - b.offset);
  awaitingCatchup.delete(generationId);

  // 立即应用（已落后于 catchup）—— 单次批量写入。
  applyAlignedReplyDeltaBatch(
    generationId,
    items.map((item) => ({
      conversationId: pending.conversationId,
      delta: item.delta,
      offset: item.offset,
    })),
  );

  // 若 gap 重新打开 awaitingCatchup，剩余实时路径将在该处缓冲。
}

function mapHistoryItem(item: ConversationMessageItem): Message | null {
  if (item.role !== 'user' && item.role !== 'assistant') return null;
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    timestamp: item.createdAt,
    status: 'sent',
  };
}

function mapHistoryItems(items: ConversationMessageItem[]): Message[] {
  return items
    .map(mapHistoryItem)
    .filter((m): m is Message => m !== null);
}

/**
 * persist 恢复后，还原分页元数据，以便上滑仍可
 * 拉取更早的服务端页（history.page/hasMore 未持久化）。
 */
async function syncHistoryPaginationMeta(): Promise<void> {
  const { conversationId, history, setHistory } = useChatStore.getState();
  if (!conversationId || history.page > 0) return;

  try {
    const page = await fetchConversationMessages(conversationId, {
      page: 1,
      pageSize: HISTORY_PAGE_SIZE,
    });
    if (useChatStore.getState().conversationId !== conversationId) return;

    const localCount = useChatStore.getState().messages.length;
    setHistory({
      page: Math.max(1, Math.ceil(localCount / HISTORY_PAGE_SIZE) || 1),
      hasMore: page.total > localCount,
      loading: false,
      loadingMore: false,
    });
  } catch {
    // 非致命 —— 用户仍可聊天；更早页可能不可用，直至切换对话
  }
}

function seedMockMessages(): void {
  if (useChatStore.getState().messages.length === 0) {
    MOCK_INITIAL_MESSAGES.forEach((msg) =>
      useChatStore.getState().addMessage(msg),
    );
  }
}

function markPendingAssistantError(): void {
  const { messages, updateMessage } = useChatStore.getState();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.status === 'pending') {
      if (!msg.content.trim()) {
        useChatStore.setState({
          messages: messages.filter((m) => m.id !== msg.id),
        });
      } else {
        updateMessage(msg.id, { status: 'error' });
      }
      break;
    }
  }
}

function finalizePendingAssistant(content?: string): void {
  const pending = useChatStore.getState().getPendingAssistant();
  if (!pending) return;
  const nextContent = content ?? pending.content;
  if (!nextContent.trim()) {
    useChatStore.setState({
      messages: useChatStore
        .getState()
        .messages.filter((m) => m.id !== pending.id),
    });
  } else {
    useChatStore.getState().updateMessage(pending.id, {
      content: nextContent,
      status: 'sent',
    });
  }
  useChatStore.getState().setLoading(false);
}

const DISCONNECT_SEND_ERROR = '哎呀，消息没发出去，请检查连接后再试';
const OFFLINE_SEND_ERROR = '哎呀，当前网络不可用，请恢复网络后再试';

/** 移除未到达服务器的本地乐观用户气泡。 */
function removeMessageById(id: string): void {
  const { messages, conversationTitle } = useChatStore.getState();
  const removed = messages.find((m) => m.id === id);
  const next = messages.filter((m) => m.id !== id);
  useChatStore.setState({ messages: next });
  if (
    removed?.role === 'user' &&
    conversationTitle === removed.content.trim() &&
    !next.some((m) => m.role === 'user')
  ) {
    useChatStore.getState().setConversationTitle(null);
  }
}

/**
 * 中止「等待 reply_start」状态（loading，无 pending 气泡）。
 * 清除停止 UI + toast；保留用户气泡（可能已在服务端）。
 * 不触碰进行中的流式气泡，以便 resume 继续。
 */
function abortWaitingForReply(errorMessage: string): boolean {
  const { ui, getPendingAssistant, conversationId, clearConversationGenerating } =
    useChatStore.getState();
  if (!ui.loading || getPendingAssistant()) return false;

  if (conversationId) clearConversationGenerating(conversationId);
  useChatStore.getState().setLoading(false);
  useChatStore.getState().setError(errorMessage);
  return true;
}

function resumePendingIfNeeded(client: WebSocketClient): void {
  const { conversationId, getPendingAssistant, setConversationId } =
    useChatStore.getState();
  const pending = getPendingAssistant();

  if (conversationId) {
    if (pending) {
      useChatStore.getState().markConversationGenerating(conversationId);
      beginAwaitingCatchup(conversationId, pending.id);
      lastGapResumeAt.set(pending.id, Date.now());
      sendResume(client, {
        conversationId,
        generationId: pending.id,
        offset: pending.content.length,
      });
    } else {
      // 可能仍有后台任务 —— 如有则 catch up
      beginAwaitingConversationCatchup(conversationId);
      sendResume(client, { conversationId });
    }
    return;
  }

  if (pending) {
    // 无可 resume 的对话 —— 将卡住的气泡标为失败
    markPendingAssistantError();
    useChatStore.getState().setLoading(false);
  }
  sendHello(client);
  void setConversationId;
}

function isActiveConversation(conversationId: string): boolean {
  return useChatStore.getState().conversationId === conversationId;
}

function handleServerMessage(raw: string): void {
  const message = parseServerMessage(raw) as ServerMessage | null;
  if (!message) return;

  const {
    addMessage,
    updateMessage,
    setLoading,
    setError,
    setConversationId,
    markConversationGenerating,
    clearConversationGenerating,
  } = useChatStore.getState();

  switch (message.type) {
    case 'connected':
      // WS client 接下来发送 `{ type: 'auth' }`；保持 connecting 直至 auth_ok。
      break;
    case 'auth_ok':
      // WebSocketClient 将状态切为 open → 运行 resumePendingIfNeeded。
      break;
    case 'session':
      // null = 服务端未绑定空白新对话（客户端本地已清空）
      if (message.conversationId === null) {
        break;
      }
      // 仅当尚无不同的活跃对话时才绑定
      // （避免覆盖切换中的视图）。优先显式 client 设置。
      if (
        !useChatStore.getState().conversationId ||
        useChatStore.getState().conversationId === message.conversationId
      ) {
        setConversationId(message.conversationId);
      }
      break;
    case 'reply_start': {
      markConversationGenerating(message.conversationId);
      if (!isActiveConversation(message.conversationId)) break;
      const existing = useChatStore
        .getState()
        .messages.find((m) => m.id === message.generationId);
      if (!existing) {
        addMessage(
          createMessage('assistant', '', 'pending', message.generationId),
        );
      } else {
        updateMessage(message.generationId, { status: 'pending' });
      }
      setLoading(false);
      setError(null);
      break;
    }
    case 'reply_delta':
      if (!isActiveConversation(message.conversationId)) break;
      applyAlignedReplyDelta(
        message.conversationId,
        message.generationId,
        message.delta,
        message.offset,
      );
      break;
    case 'reply_catchup': {
      // 合并 catchup 快照前，先应用已合并的实时 delta。
      flushReplyDeltaQueue(message.generationId);
      if (message.done) {
        clearConversationGenerating(message.conversationId);
      } else {
        markConversationGenerating(message.conversationId);
      }
      if (!isActiveConversation(message.conversationId)) {
        clearAwaitingCatchup(message.generationId);
        awaitingConversationCatchup.delete(message.conversationId);
        discardReplyDeltaQueue(message.generationId);
        break;
      }
      const msg = useChatStore
        .getState()
        .messages.find((m) => m.id === message.generationId);
      const merged = mergeCatchupContent(
        msg?.content ?? '',
        message.content,
        message.offset,
      );
      if (!msg) {
        addMessage(
          createMessage(
            'assistant',
            merged,
            message.done ? 'sent' : 'pending',
            message.generationId,
          ),
        );
      } else {
        updateMessage(message.generationId, {
          content: merged,
          status: message.done ? 'sent' : 'pending',
        });
      }
      awaitingConversationCatchup.delete(message.conversationId);
      flushBufferedDeltas(message.generationId);
      if (message.done) {
        setLoading(false);
      }
      break;
    }
    case 'reply_end':
      // 结束 payload 为权威 —— 丢弃未应用的合并 delta。
      discardReplyDeltaQueue(message.generationId);
      clearConversationGenerating(message.conversationId);
      clearAwaitingCatchup(message.generationId);
      awaitingConversationCatchup.delete(message.conversationId);
      if (!isActiveConversation(message.conversationId)) break;
      // 完整快照 —— 流式结束后的权威校正
      updateMessage(message.generationId, {
        content: message.content,
        status: 'sent',
      });
      if (!message.content.trim()) {
        useChatStore.setState({
          messages: useChatStore
            .getState()
            .messages.filter((m) => m.id !== message.generationId),
        });
      }
      setLoading(false);
      setError(null);
      break;
    case 'reply':
      addMessage(
        createMessage(
          'assistant',
          message.content,
          'sent',
          message.generationId ?? message.messageId,
        ),
      );
      setLoading(false);
      setError(null);
      break;
    case 'generation_error':
      clearConversationGenerating(message.conversationId);
      clearAwaitingCatchup(message.generationId);
      awaitingConversationCatchup.delete(message.conversationId);
      if (!isActiveConversation(message.conversationId)) break;
      setLoading(false);
      setError(message.message);
      {
        const pending = useChatStore.getState().getPendingAssistant();
        if (pending && pending.id === message.generationId) {
          if (!pending.content.trim()) {
            useChatStore.setState({
              messages: useChatStore
                .getState()
                .messages.filter((m) => m.id !== pending.id),
            });
          } else {
            updateMessage(pending.id, { status: 'error' });
          }
        }
      }
      break;
    case 'error':
      setLoading(false);
      setError(message.message);
      if (message.code === 'ALREADY_PROCESSING') {
        break;
      }
      markPendingAssistantError();
      break;
    default:
      break;
  }
}

function useMockChatService() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationIdRef = useRef<string | null>(null);
  const navEpochRef = useRef(0);
  const { addMessage, setLoading, setError, setConnectionStatus } =
    useChatStore();

  useEffect(() => {
    setConnectionStatus('open');

    const unsub = useChatStore.persist.onFinishHydration(seedMockMessages);
    if (useChatStore.persist.hasHydrated()) {
      seedMockMessages();
    }

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    };
  }, [setConnectionStatus]);

  const stopGeneration = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    generationIdRef.current = null;
    finalizePendingAssistant();
    return true;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!isValidMessage(trimmed)) return false;
      if (useChatStore.getState().getPendingAssistant()) return false;

      addMessage(createMessage('user', trimmed));
      if (!useChatStore.getState().conversationTitle) {
        useChatStore.getState().setConversationTitle(trimmed);
      }
      setLoading(true);
      setError(null);

      if (timerRef.current) clearTimeout(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);

      timerRef.current = setTimeout(() => {
        const full = generateMockReply(trimmed);
        const messageId = newId();
        generationIdRef.current = messageId;
        const { addMessage: add, appendMessageContent, updateMessage } =
          useChatStore.getState();

        add(createMessage('assistant', '', 'pending', messageId));
        setLoading(false);

        let offset = 0;
        chunkTimerRef.current = setInterval(() => {
          if (offset >= full.length) {
            if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
            chunkTimerRef.current = null;
            generationIdRef.current = null;
            updateMessage(messageId, { content: full, status: 'sent' });
            return;
          }
          const delta = full.slice(offset, offset + MOCK_CHUNK_SIZE);
          offset += MOCK_CHUNK_SIZE;
          appendMessageContent(messageId, delta);
        }, MOCK_CHUNK_INTERVAL_MS);
      }, MOCK_REPLY_DELAY_MS);

      return true;
    },
    [addMessage, setLoading, setError],
  );

  const reconnect = useCallback(() => {
    setConnectionStatus('open');
    setError(null);
  }, [setConnectionStatus, setError]);

  const disconnect = useCallback(() => {
    // Mock 无实时 socket
  }, []);

  const clearConversation = useCallback(() => {
    const { conversationId, getPendingAssistant, markConversationGenerating } =
      useChatStore.getState();
    // 保留后台任务运行，以便用户稍后切回
    if (conversationId && getPendingAssistant()) {
      markConversationGenerating(conversationId);
    }
    navEpochRef.current += 1;
    useChatStore.getState().clearChat();
  }, []);

  /** 服务端删除后：停止本地生成、清除 loading，不重新挂载生成状态。 */
  const resetAfterConversationDeleted = useCallback(
    (deletedId: string) => {
      const store = useChatStore.getState();
      const isActive = store.conversationId === deletedId;
      if (isActive) {
        stopGeneration();
        store.setLoading(false);
        navEpochRef.current += 1;
        store.clearChat();
      }
      useChatStore.getState().clearConversationGenerating(deletedId);
    },
    [stopGeneration],
  );

  const switchConversation = useCallback(async (
    nextId: string,
    title?: string,
  ) => {
    const { conversationId, history, getPendingAssistant, markConversationGenerating } =
      useChatStore.getState();
    if (nextId === conversationId || history.loading) return;

    // 不停止 —— 保持任务运行；标记以便侧栏显示「生成中」
    if (conversationId && getPendingAssistant()) {
      markConversationGenerating(conversationId);
    }

    const epoch = ++navEpochRef.current;
    useChatStore.getState().setHistory({ loading: true });
    useChatStore.getState().setError(null);
    if (title !== undefined) {
      useChatStore.getState().setConversationTitle(title.trim() || null);
    }

    try {
      const page = await fetchConversationMessages(nextId, {
        page: 1,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (epoch !== navEpochRef.current) return;

      useChatStore.getState().setConversationId(nextId);
      useChatStore.getState().setMessages(mapHistoryItems(page.items));
      useChatStore.getState().setHistory({
        page: page.page,
        hasMore: page.hasMore,
        loading: false,
        loadingMore: false,
      });
      useChatStore.getState().setLoading(false);
    } catch (error) {
      if (epoch !== navEpochRef.current) return;
      useChatStore.getState().setHistory({ loading: false });
      useChatStore.getState().setError(
        error instanceof Error
          ? error.message
          : '哎呀，消息加载失败了，请稍后重试',
      );
    }
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const { conversationId, history } = useChatStore.getState();
    if (!conversationId || !history.hasMore || history.loadingMore || history.loading) {
      return;
    }

    const requestedId = conversationId;
    const nextPage = history.page + 1;
    useChatStore.getState().setHistory({ loadingMore: true });
    try {
      const page = await fetchConversationMessages(requestedId, {
        page: nextPage,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (useChatStore.getState().conversationId !== requestedId) {
        return;
      }
      useChatStore.getState().prependMessages(mapHistoryItems(page.items));
      useChatStore.getState().setHistory({
        page: page.page,
        hasMore: page.hasMore,
        loadingMore: false,
      });
    } catch (error) {
      if (useChatStore.getState().conversationId !== requestedId) return;
      useChatStore.getState().setHistory({ loadingMore: false });
      useChatStore.getState().setError(
        error instanceof Error
          ? error.message
          : '哎呀，更早的消息加载失败了，请稍后重试',
      );
    }
  }, []);

  return {
    sendMessage,
    stopGeneration,
    reconnect,
    disconnect,
    clearConversation,
    resetAfterConversationDeleted,
    switchConversation,
    loadOlderMessages,
  };
}

function useRealChatService() {
  const clientRef = useRef<WebSocketClient | null>(null);
  const navEpochRef = useRef(0);
  const { addMessage, setLoading, setError, setConnectionStatus } =
    useChatStore();

  useEffect(() => {
    const client = new WebSocketClient(getWebSocketUrl(), {
      getAuthToken: () => useAuthStore.getState().token,
      onAuthFailure: (reason) => {
        useAuthStore.getState().forceLogoutLocal({ reason: 'unauthorized' });
        useChatStore
          .getState()
          .setError(
            reason === 'missing_token'
              ? '请先登录'
              : '登录已失效，请重新登录',
          );
      },
      // USE_MOCK 使用独立 mock 服务 —— 连接真实 backend 时不应进入此分支。
      skipAuth: false,
    });
    clientRef.current = client;
    chatClientRef = client;

    client.onMessage(handleServerMessage);
    client.onStatusChange((status) => {
      setConnectionStatus(status);
      // 瞬时断线不终止 pending —— reopen + auth_ok 后 resume
      if (status === 'open') {
        resumePendingIfNeeded(client);
      } else if (status === 'closed') {
        // 已发送但未收到 reply_start —— 退出停止 UI（不终止流式 pending）
        abortWaitingForReply(DISCONNECT_SEND_ERROR);
      }
    });
    client.connect();

    const onBrowserOffline = () => {
      abortWaitingForReply(OFFLINE_SEND_ERROR);
    };
    window.addEventListener('offline', onBrowserOffline);

    const onHydrated = () => {
      if (client.getStatus() === 'open') {
        resumePendingIfNeeded(client);
      }
      void syncHistoryPaginationMeta();
    };
    const unsub = useChatStore.persist.onFinishHydration(onHydrated);
    if (useChatStore.persist.hasHydrated()) {
      if (client.getStatus() === 'open') {
        resumePendingIfNeeded(client);
      }
      void syncHistoryPaginationMeta();
    }

    return () => {
      unsub();
      window.removeEventListener('offline', onBrowserOffline);
      client.disconnect();
      clientRef.current = null;
      if (chatClientRef === client) chatClientRef = null;
      clearAllCatchupState();
    };
  }, [setConnectionStatus]);

  const stopGeneration = useCallback(() => {
    const client = clientRef.current;
    const {
      conversationId,
      getPendingAssistant,
      clearConversationGenerating,
      setLoading: setLoadingState,
    } = useChatStore.getState();
    const pending = getPendingAssistant();
    if (!client || !conversationId || !pending) {
      finalizePendingAssistant();
      if (conversationId) clearConversationGenerating(conversationId);
      // 等待 reply_start 且无气泡 —— 仍退出停止 UI
      setLoadingState(false);
      return false;
    }
    const sent = sendStop(client, conversationId, pending.id);
    clearConversationGenerating(conversationId);
    // 本地乐观结束；reply_end 将对齐
    finalizePendingAssistant();
    return sent;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!isValidMessage(trimmed)) return false;
      if (useChatStore.getState().getPendingAssistant()) return false;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError(OFFLINE_SEND_ERROR);
        return false;
      }

      const client = clientRef.current;
      if (!client || client.getStatus() !== 'open') {
        setError('哎呀，还没连上服务器，请检查网络后再试');
        return false;
      }

      const { model, conversationId, conversationTitle } =
        useChatStore.getState();

      const userMessage = createMessage('user', trimmed);
      addMessage(userMessage);
      if (!conversationTitle) {
        useChatStore.getState().setConversationTitle(trimmed);
      }
      setLoading(true);
      setError(null);

      const sent = sendChatMessage(client, trimmed, {
        model,
        conversationId: conversationId ?? undefined,
      });
      if (!sent) {
        removeMessageById(userMessage.id);
        setLoading(false);
        setError(DISCONNECT_SEND_ERROR);
        return false;
      }

      // Chrome 离线时常使 WS readyState 仍为 OPEN；发送后立即检测
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        removeMessageById(userMessage.id);
        setLoading(false);
        setError(OFFLINE_SEND_ERROR);
        return false;
      }

      return true;
    },
    [addMessage, setLoading, setError],
  );

  const reconnect = useCallback(() => {
    setError(null);
    clientRef.current?.reconnect();
  }, [setError]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const clearConversation = useCallback(() => {
    const client = clientRef.current;
    const { conversationId, getPendingAssistant, markConversationGenerating } =
      useChatStore.getState();
    // 保留后台生成；仅将 WS 重新绑定到新会话
    if (conversationId && getPendingAssistant()) {
      markConversationGenerating(conversationId);
    }
    navEpochRef.current += 1;
    useChatStore.getState().clearChat();
    if (client && client.getStatus() === 'open') {
      sendHello(client);
    }
  }, []);

  /** 服务端删除后：停止任务、清除 loading/生成状态，重新绑定空白会话。 */
  const resetAfterConversationDeleted = useCallback(
    (deletedId: string) => {
      const store = useChatStore.getState();
      const isActive = store.conversationId === deletedId;
      if (isActive) {
        stopGeneration();
        store.setLoading(false);
        navEpochRef.current += 1;
        store.clearChat();
        const client = clientRef.current;
        if (client && client.getStatus() === 'open') {
          sendHello(client);
        }
      }
      useChatStore.getState().clearConversationGenerating(deletedId);
    },
    [stopGeneration],
  );

  const switchConversation = useCallback(async (
    nextId: string,
    title?: string,
  ) => {
    const {
      conversationId,
      history,
      getPendingAssistant,
      markConversationGenerating,
    } = useChatStore.getState();
    if (nextId === conversationId || history.loading) return;

    const client = clientRef.current;

    // 不停止 —— 保留任务运行，待用户返回
    if (conversationId && getPendingAssistant()) {
      markConversationGenerating(conversationId);
    }

    const epoch = ++navEpochRef.current;
    useChatStore.getState().setHistory({ loading: true });
    useChatStore.getState().setError(null);
    if (title !== undefined) {
      useChatStore.getState().setConversationTitle(title.trim() || null);
    }

    try {
      const page = await fetchConversationMessages(nextId, {
        page: 1,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (epoch !== navEpochRef.current) return;

      useChatStore.getState().setConversationId(nextId);
      useChatStore.getState().setMessages(mapHistoryItems(page.items));
      useChatStore.getState().setHistory({
        page: page.page,
        hasMore: page.hasMore,
        loading: false,
        loadingMore: false,
      });
      useChatStore.getState().setLoading(false);

      if (client && client.getStatus() === 'open') {
        // 绑定并 catch up 目标对话上进行中/已完成的 generation
        beginAwaitingConversationCatchup(nextId);
        sendResume(client, { conversationId: nextId });
      }
    } catch (error) {
      if (epoch !== navEpochRef.current) return;
      useChatStore.getState().setHistory({ loading: false });
      useChatStore.getState().setError(
        error instanceof Error
          ? error.message
          : '哎呀，消息加载失败了，请稍后重试',
      );
    }
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const { conversationId, history } = useChatStore.getState();
    if (
      !conversationId ||
      !history.hasMore ||
      history.loadingMore ||
      history.loading
    ) {
      return;
    }

    const requestedId = conversationId;
    const nextPage = history.page + 1;
    useChatStore.getState().setHistory({ loadingMore: true });
    try {
      const page = await fetchConversationMessages(requestedId, {
        page: nextPage,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (useChatStore.getState().conversationId !== requestedId) {
        return;
      }
      useChatStore.getState().prependMessages(mapHistoryItems(page.items));
      useChatStore.getState().setHistory({
        page: page.page,
        hasMore: page.hasMore,
        loadingMore: false,
      });
    } catch (error) {
      if (useChatStore.getState().conversationId !== requestedId) return;
      useChatStore.getState().setHistory({ loadingMore: false });
      useChatStore.getState().setError(
        error instanceof Error
          ? error.message
          : '哎呀，更早的消息加载失败了，请稍后重试',
      );
    }
  }, []);

  return {
    sendMessage,
    stopGeneration,
    reconnect,
    disconnect,
    clearConversation,
    resetAfterConversationDeleted,
    switchConversation,
    loadOlderMessages,
  };
}

/** USE_MOCK 为构建时常量 —— 每个会话仅使用一个分支。 */
export function useChatService() {
  if (USE_MOCK) {
    return useMockChatService();
  }
  return useRealChatService();
}
