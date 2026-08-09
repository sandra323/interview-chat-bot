import { useCallback, useEffect, useRef } from 'react';
import type { ServerMessage } from '@ai-chat/shared';
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
import { createMessage, useChatStore } from '@/store/useChatStore';
import { getWebSocketUrl, isValidMessage } from '@/utils/validators';

const MOCK_CHUNK_SIZE = 4;
const MOCK_CHUNK_INTERVAL_MS = 28;

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

function resumePendingIfNeeded(client: WebSocketClient): void {
  const { conversationId, getPendingAssistant, setConversationId } =
    useChatStore.getState();
  const pending = getPendingAssistant();

  if (conversationId) {
    if (pending) {
      sendResume(client, {
        conversationId,
        generationId: pending.id,
        offset: pending.content.length,
      });
    } else {
      sendHello(client, conversationId);
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

function handleServerMessage(raw: string): void {
  const message = parseServerMessage(raw) as ServerMessage | null;
  if (!message) return;

  const {
    addMessage,
    appendMessageContent,
    updateMessage,
    setLoading,
    setError,
    setConnectionStatus,
    setConversationId,
  } = useChatStore.getState();

  switch (message.type) {
    case 'connected':
      setConnectionStatus('open');
      break;
    case 'session':
      setConversationId(message.conversationId);
      break;
    case 'reply_start': {
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
      setConversationId(message.conversationId);
      setLoading(false);
      setError(null);
      break;
    }
    case 'reply_delta':
      appendMessageContent(message.generationId, message.delta);
      break;
    case 'reply_catchup': {
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
      setConversationId(message.conversationId);
      if (message.done) {
        setLoading(false);
      }
      break;
    }
    case 'reply_end':
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

  const clearConversation = useCallback(() => {
    stopGeneration();
    useChatStore.getState().clearChat();
  }, [stopGeneration]);

  return { sendMessage, stopGeneration, reconnect, clearConversation };
}

function useRealChatService() {
  const clientRef = useRef<WebSocketClient | null>(null);
  const { addMessage, setLoading, setError, setConnectionStatus } =
    useChatStore();

  useEffect(() => {
    const client = new WebSocketClient(getWebSocketUrl());
    clientRef.current = client;

    client.onMessage(handleServerMessage);
    client.onStatusChange((status) => {
      setConnectionStatus(status);
      // Do not kill pending on transient disconnect — resume after reopen
      if (status === 'open') {
        resumePendingIfNeeded(client);
      }
    });
    client.connect();

    const onHydrated = () => {
      if (client.getStatus() === 'open') {
        resumePendingIfNeeded(client);
      }
    };
    const unsub = useChatStore.persist.onFinishHydration(onHydrated);
    if (useChatStore.persist.hasHydrated() && client.getStatus() === 'open') {
      resumePendingIfNeeded(client);
    }

    return () => {
      unsub();
      client.disconnect();
      clientRef.current = null;
    };
  }, [setConnectionStatus]);

  const stopGeneration = useCallback(() => {
    const client = clientRef.current;
    const { conversationId, getPendingAssistant } = useChatStore.getState();
    const pending = getPendingAssistant();
    if (!client || !conversationId || !pending) {
      finalizePendingAssistant();
      return false;
    }
    const sent = sendStop(client, conversationId, pending.id);
    // Optimistic local end; reply_end will align
    finalizePendingAssistant();
    return sent;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!isValidMessage(trimmed)) return false;
      if (useChatStore.getState().getPendingAssistant()) return false;

      const client = clientRef.current;
      if (!client || client.getStatus() !== 'open') {
        setError('哎呀，还没连上服务器，请先启动后端');
        return false;
      }

      const { model, conversationId } = useChatStore.getState();

      addMessage(createMessage('user', trimmed));
      setLoading(true);
      setError(null);

      const sent = sendChatMessage(client, trimmed, {
        model,
        conversationId: conversationId ?? undefined,
      });
      if (!sent) {
        setLoading(false);
        setError('哎呀，消息没发出去，请检查连接后再试');
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

  const clearConversation = useCallback(() => {
    const client = clientRef.current;
    const { conversationId, getPendingAssistant } = useChatStore.getState();
    const pending = getPendingAssistant();
    if (client && conversationId && pending) {
      sendStop(client, conversationId, pending.id);
    }
    useChatStore.getState().clearChat();
    if (client && client.getStatus() === 'open') {
      sendHello(client);
    }
  }, []);

  return { sendMessage, stopGeneration, reconnect, clearConversation };
}

/** USE_MOCK is a build-time constant — only one branch is used per session. */
export function useChatService() {
  if (USE_MOCK) {
    return useMockChatService();
  }
  return useRealChatService();
}
