import { useCallback, useEffect, useRef } from 'react';
import type { ServerMessage } from '@ai-chat/shared';
import { USE_MOCK, MOCK_REPLY_DELAY_MS } from '@/config/app';
import { generateMockReply, MOCK_INITIAL_MESSAGES } from '@/mocks/chatMock';
import { parseServerMessage } from '@/apis/websocket/messageParser';
import { sendChatMessage } from '@/apis/websocket/chat';
import { WebSocketClient } from '@/apis/websocket/client';
import { createMessage, useChatStore } from '@/store/useChatStore';
import { getWebSocketUrl, isValidMessage } from '@/utils/validators';

function seedMockMessages(): void {
  if (useChatStore.getState().messages.length === 0) {
    MOCK_INITIAL_MESSAGES.forEach((msg) =>
      useChatStore.getState().addMessage(msg),
    );
  }
}

function handleServerMessage(raw: string): void {
  const message = parseServerMessage(raw) as ServerMessage | null;
  if (!message) return;

  const { addMessage, setLoading, setError, setConnectionStatus } =
    useChatStore.getState();

  switch (message.type) {
    case 'connected':
      setConnectionStatus('open');
      break;
    case 'reply':
      addMessage(createMessage('assistant', message.content, 'sent'));
      setLoading(false);
      setError(null);
      break;
    case 'error':
      setLoading(false);
      setError(message.message);
      break;
    default:
      break;
  }
}

function useMockChatService() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    };
  }, [setConnectionStatus]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!isValidMessage(trimmed)) return false;

      addMessage(createMessage('user', trimmed));
      setLoading(true);
      setError(null);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        addMessage(createMessage('assistant', generateMockReply(trimmed)));
        setLoading(false);
      }, MOCK_REPLY_DELAY_MS);

      return true;
    },
    [addMessage, setLoading, setError],
  );

  const reconnect = useCallback(() => {
    setConnectionStatus('open');
    setError(null);
  }, [setConnectionStatus, setError]);

  return { sendMessage, reconnect };
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
    });
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [setConnectionStatus]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!isValidMessage(trimmed)) return false;

      const client = clientRef.current;
      if (!client || client.getStatus() !== 'open') {
        setError('哎呀，还没连上服务器，请先启动后端');
        return false;
      }

      const model = useChatStore.getState().model;

      addMessage(createMessage('user', trimmed));
      setLoading(true);
      setError(null);

      const sent = sendChatMessage(client, trimmed, model);
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

  return { sendMessage, reconnect };
}

/** USE_MOCK is a build-time constant — only one branch is used per session. */
export function useChatService() {
  if (USE_MOCK) {
    return useMockChatService();
  }
  return useRealChatService();
}
