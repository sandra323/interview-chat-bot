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

  // Stop / generating UI only for the *current* conversation
  const isGenerating = useMemo(
    () => ui.loading || hasPendingAssistant,
    [hasPendingAssistant, ui.loading],
  );

  // Refresh sidebar only when a reply finishes (not on every mount)
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating) {
      setHistoryRefreshKey((k) => k + 1);
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Refresh when conversation changes (new session id / switch / clear).
  // Wait until persist rehydrate finishes, then skip that first hydrated value
  // so Sidebar's mount fetch remains the only initial /api/conversations call.
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
