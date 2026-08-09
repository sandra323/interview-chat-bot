import { useCallback, useEffect, useRef } from 'react';
import { USE_MOCK, MOCK_REPLY_DELAY_MS } from '@/config/app';
import { generateMockReply, MOCK_INITIAL_MESSAGES } from '@/mocks/chatMock';
import { createMessage, useChatStore } from '@/store/useChatStore';
import { isValidMessage } from '@/utils/validators';

// ---------------------------------------------------------------------------
// 真实 API / WebSocket 联调（mock 模式下暂不使用，恢复联调时取消注释）
// ---------------------------------------------------------------------------
// import type { ServerMessage } from '@ai-chat/shared';
// import { parseServerMessage } from '@/apis/websocket/messageParser';
// import { sendChatMessage } from '@/apis/websocket/chat';
// import { WebSocketClient } from '@/apis/websocket/client';
// import { getWebSocketUrl, isConfigComplete } from '@/utils/validators';
//
// function handleServerMessage(...) { ... }
// function useRealChatService() { ... }

function seedMockMessages(): void {
  if (useChatStore.getState().messages.length === 0) {
    MOCK_INITIAL_MESSAGES.forEach((msg) =>
      useChatStore.getState().addMessage(msg),
    );
  }
}

function useMockChatService() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addMessage, setLoading, setError, setConnectionStatus, setConfig } =
    useChatStore();

  useEffect(() => {
    setConnectionStatus('open');
    setConfig({
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'sk-mock-key-for-preview',
      model: 'gpt-4o-mini',
    });

    const unsub = useChatStore.persist.onFinishHydration(seedMockMessages);
    if (useChatStore.persist.hasHydrated()) {
      seedMockMessages();
    }

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setConnectionStatus, setConfig]);

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

export function useChatService() {
  return useMockChatService();

  // 恢复真实 API 联调：
  // return USE_MOCK ? useMockChatService() : useRealChatService();
}

void USE_MOCK;
