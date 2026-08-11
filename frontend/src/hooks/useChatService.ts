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
import { getWebSocketUrl, isValidMessage } from '@/utils/validators';

const MOCK_CHUNK_SIZE = 4;
const MOCK_CHUNK_INTERVAL_MS = 28;

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
 * After persist rehydrate, restore pagination meta so scroll-up can still
 * fetch older server pages (history.page/hasMore are not persisted).
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
    // Non-fatal — user can still chat; older pages may be unavailable until switch
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

/** Remove a locally-optimistic user bubble that never reached the server. */
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
 * Abort "waiting for reply_start" (loading, no pending bubble).
 * Clears Stop UI + toast; keeps the user bubble (may already be on server).
 * Does not touch in-flight streaming bubbles so resume can continue.
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
      sendResume(client, {
        conversationId,
        generationId: pending.id,
        offset: pending.content.length,
      });
    } else {
      // May still have a background job — catch up if any
      sendResume(client, { conversationId });
    }
    return;
  }

  if (pending) {
    // No conversation to resume — fail the stuck bubble
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
    appendMessageContent,
    updateMessage,
    setLoading,
    setError,
    setConversationId,
    markConversationGenerating,
    clearConversationGenerating,
  } = useChatStore.getState();

  switch (message.type) {
    case 'connected':
      // WS client sends `{ type: 'auth' }` next; stay connecting until auth_ok.
      break;
    case 'auth_ok':
      // WebSocketClient flips status to open → resumePendingIfNeeded runs.
      break;
    case 'session':
      // null = server unbound for a blank new chat (client already cleared locally)
      if (message.conversationId === null) {
        break;
      }
      // Only bind when we don't already have a different active conversation
      // (avoids clobbering a mid-switch view). Prefer explicit client sets.
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
      appendMessageContent(message.generationId, message.delta);
      break;
    case 'reply_catchup': {
      if (message.done) {
        clearConversationGenerating(message.conversationId);
      } else {
        markConversationGenerating(message.conversationId);
      }
      if (!isActiveConversation(message.conversationId)) break;
      const msg = useChatStore
        .getState()
        .messages.find((m) => m.id === message.generationId);
      const merged =
        (msg?.content.slice(0, message.offset) ?? '') + message.content;
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
      if (message.done) {
        setLoading(false);
      }
      break;
    }
    case 'reply_end':
      clearConversationGenerating(message.conversationId);
      if (!isActiveConversation(message.conversationId)) break;
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
        const messageId = crypto.randomUUID();
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
    // Mock has no live socket
  }, []);

  const clearConversation = useCallback(() => {
    const { conversationId, getPendingAssistant, markConversationGenerating } =
      useChatStore.getState();
    // Leave background jobs running so user can switch back later
    if (conversationId && getPendingAssistant()) {
      markConversationGenerating(conversationId);
    }
    navEpochRef.current += 1;
    useChatStore.getState().clearChat();
  }, []);

  /** After server-side delete: stop local gen, clear loading, do not remount generating. */
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

    // Do not stop — keep job running; mark so sidebar shows 生成中
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
      // USE_MOCK uses a separate mock service — never hit this branch with a live backend.
      skipAuth: false,
    });
    clientRef.current = client;

    client.onMessage(handleServerMessage);
    client.onStatusChange((status) => {
      setConnectionStatus(status);
      // Do not kill pending on transient disconnect — resume after reopen + auth_ok
      if (status === 'open') {
        resumePendingIfNeeded(client);
      } else if (status === 'closed') {
        // Sent but never got reply_start — exit Stop UI (don't kill streaming pending)
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
      // Waiting for reply_start with no bubble — still exit Stop UI
      setLoadingState(false);
      return false;
    }
    const sent = sendStop(client, conversationId, pending.id);
    clearConversationGenerating(conversationId);
    // Optimistic local end; reply_end will align
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

      // Chrome Offline often leaves WS readyState OPEN; catch right after send
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
    // Keep background generation; only rebind WS to a fresh session
    if (conversationId && getPendingAssistant()) {
      markConversationGenerating(conversationId);
    }
    navEpochRef.current += 1;
    useChatStore.getState().clearChat();
    if (client && client.getStatus() === 'open') {
      sendHello(client);
    }
  }, []);

  /** After server-side delete: stop job, clear loading/generating, rebind blank session. */
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

    // Do not stop — leave job running for when the user returns
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
        // Bind + catch up any in-flight / finished generation on the target
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

/** USE_MOCK is a build-time constant — only one branch is used per session. */
export function useChatService() {
  if (USE_MOCK) {
    return useMockChatService();
  }
  return useRealChatService();
}
