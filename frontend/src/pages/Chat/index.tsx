import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message as antdMessage } from 'antd';
import { USE_MOCK } from '@/config/app';
import { MODEL_OPTIONS } from '@/config/models';
import Header from '@/components/Layout/Header';
import Main from '@/components/Layout/Main';
import ConnectionBanner from '@/components/ConnectionBanner';
import { useChatService } from '@/hooks/useChatService';
import { useChatStore } from '@/store/useChatStore';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import Sidebar from './components/Sidebar';
import styles from './index.module.less';

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const wasGeneratingRef = useRef(false);
  const skipInitialConvRefreshRef = useRef(true);
  const {
    sendMessage,
    stopGeneration,
    clearConversation,
    resetAfterConversationDeleted,
    switchConversation,
    loadOlderMessages,
    disconnect,
  } = useChatService();

  const messageCount = useChatStore((s) => s.messages.length);
  const hasPendingAssistant = useChatStore((s) =>
    s.messages.some((m) => m.role === 'assistant' && m.status === 'pending'),
  );
  const conversationId = useChatStore((s) => s.conversationId);
  const conversationTitle = useChatStore((s) => s.conversationTitle);
  const model = useChatStore((s) => s.model);
  const ui = useChatStore((s) => s.ui);
  const history = useChatStore((s) => s.history);
  const generatingConversationIds = useChatStore(
    (s) => s.generatingConversationIds,
  );
  const hasHydrated = useChatStore((s) => s._hasHydrated);
  const setModel = useChatStore((s) => s.setModel);
  const setError = useChatStore((s) => s.setError);
  const syncGeneratingFromServer = useChatStore(
    (s) => s.syncGeneratingFromServer,
  );

  useEffect(() => {
    if (!ui.error) return;
    antdMessage.error(ui.error);
    setError(null);
  }, [ui.error, setError]);

  const handleModelChange = useCallback(
    (next: string) => {
      setModel(next);
    },
    [setModel],
  );

  const handleNewChat = useCallback(() => {
    if (messageCount === 0) return;
    clearConversation();
  }, [clearConversation, messageCount]);

  const handleSelectConversation = useCallback(
    (id: string, title: string) => {
      void switchConversation(id, title);
    },
    [switchConversation],
  );

  const handleConversationDeleted = useCallback(
    (id: string) => {
      resetAfterConversationDeleted(id);
    },
    [resetAfterConversationDeleted],
  );

  const handleConversationRenamed = useCallback((id: string, title: string) => {
    const state = useChatStore.getState();
    if (state.conversationId === id) {
      state.setConversationTitle(title);
    }
  }, []);

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleGeneratingSync = useCallback(
    (serverGeneratingIds: string[]) => {
      const { conversationId: activeId, getPendingAssistant } =
        useChatStore.getState();
      const merged = new Set(serverGeneratingIds);
      if (activeId && getPendingAssistant()) {
        merged.add(activeId);
      }
      syncGeneratingFromServer([...merged]);
    },
    [syncGeneratingFromServer],
  );

  // 停止 / 生成 UI 仅针对*当前*对话
  const isGenerating = useMemo(
    () => ui.loading || hasPendingAssistant,
    [hasPendingAssistant, ui.loading],
  );

  // 仅在回复结束时刷新侧栏（非每次挂载）
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating) {
      setHistoryRefreshKey((k) => k + 1);
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // 对话变更时刷新（新 session id / 切换 / 清空）。
  // 等待 persist 恢复完成，再跳过首次 hydrated 值，
  // 使 Sidebar 挂载时的 fetch 成为唯一初始 /api/conversations 调用。
  useEffect(() => {
    if (!hasHydrated) return;
    if (skipInitialConvRefreshRef.current) {
      skipInitialConvRefreshRef.current = false;
      return;
    }
    setHistoryRefreshKey((k) => k + 1);
  }, [conversationId, hasHydrated]);

  const isInputDisabled =
    (!USE_MOCK && ui.connectionStatus !== 'open') || history.loading;

  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;

  return (
    <div className={styles.page}>
      <Header
        title={conversationTitle?.trim() || undefined}
        model={model}
        onModelChange={handleModelChange}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onClearChat={handleNewChat}
        showMockBadge={USE_MOCK}
      />
      {!USE_MOCK && <ConnectionBanner status={ui.connectionStatus} />}
      <div className={styles.body}>
        <Sidebar
          open={sidebarOpen}
          refreshKey={historyRefreshKey}
          activeConversationId={conversationId}
          generatingConversationIds={generatingConversationIds}
          modelLabel={modelLabel}
          newChatDisabled={messageCount === 0}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onGeneratingSync={handleGeneratingSync}
          onConversationDeleted={handleConversationDeleted}
          onConversationRenamed={handleConversationRenamed}
          onDisconnect={disconnect}
        />
        <div className={styles.mainColumn}>
          <Main>
            <section className={styles.chatArea} aria-label="Chat conversation">
              <MessageList
                loading={ui.loading && !isGenerating}
                modelLabel={modelLabel}
                onSuggestion={handleSuggestion}
                scrollContainerRef={chatScrollRef}
                conversationId={conversationId}
                hasMoreHistory={history.hasMore}
                loadingOlder={history.loadingMore}
                onLoadOlder={() => {
                  void loadOlderMessages();
                }}
              />
              <ChatInput
                onSend={sendMessage}
                onStop={stopGeneration}
                disabled={isInputDisabled}
                isGenerating={isGenerating}
              />
            </section>
          </Main>
        </div>
      </div>
    </div>
  );
}
