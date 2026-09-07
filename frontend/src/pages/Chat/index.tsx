import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message as antdMessage } from 'antd';
import { USE_MOCK } from '@/config/app';
import { MODEL_OPTIONS } from '@/config/models';
import Header from '@/components/Layout/Header';
import Main from '@/components/Layout/Main';
import ConnectionBanner from '@/components/ConnectionBanner';
import { fetchKnowledgeBases } from '@/apis/knowledgeBases';
import { patchConversation } from '@/apis/conversations';
import { userFacingApiMessage } from '@/apis/http/client';
import { useChatService } from '@/hooks/useChatService';
import { useChatStore } from '@/store/useChatStore';
import Sidebar from './components/Sidebar';
import { getMainViewChrome, MainView } from './mainView';
import { renderMainView } from './renderMainView';
import styles from './index.module.less';

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [mainView, setMainView] = useState<MainView>(MainView.Chat);
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
  const generatingConversationIds = useChatStore(
    (s) => s.generatingConversationIds,
  );
  const hasHydrated = useChatStore((s) => s._hasHydrated);
  const knowledgeBaseId = useChatStore((s) => s.knowledgeBaseId);
  const setModel = useChatStore((s) => s.setModel);
  const setKnowledgeBaseId = useChatStore((s) => s.setKnowledgeBaseId);
  const setError = useChatStore((s) => s.setError);
  const syncGeneratingFromServer = useChatStore(
    (s) => s.syncGeneratingFromServer,
  );
  const [kbOptions, setKbOptions] = useState<{ value: string; label: string }[]>(
    [],
  );

  useEffect(() => {
    if (!ui.error) return;
    antdMessage.error(ui.error);
    setError(null);
  }, [ui.error, setError]);

  useEffect(() => {
    if (USE_MOCK) return;
    let cancelled = false;
    void fetchKnowledgeBases()
      .then((items) => {
        if (cancelled) return;
        setKbOptions(items.map((kb) => ({ value: kb.id, label: kb.name })));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        antdMessage.error(userFacingApiMessage(error, '哎呀，知识库列表加载失败了'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModelChange = useCallback(
    (next: string) => {
      setModel(next);
    },
    [setModel],
  );

  const handleKnowledgeBaseChange = useCallback(
    (next: string | null) => {
      setKnowledgeBaseId(next);
      const id = useChatStore.getState().conversationId;
      if (!id || USE_MOCK) return;
      void patchConversation(id, { knowledgeBaseId: next }).catch(
        (error: unknown) => {
          antdMessage.error(
            userFacingApiMessage(error, '哎呀，知识库绑定失败了'),
          );
        },
      );
    },
    [setKnowledgeBaseId],
  );

  const handleOpenLibrary = useCallback(() => {
    setMainView(MainView.Library);
  }, []);

  const handleNewChat = useCallback(() => {
    setMainView(MainView.Chat);
    if (messageCount === 0) return;
    clearConversation();
  }, [clearConversation, messageCount]);

  const handleSelectConversation = useCallback(
    (id: string, title: string, nextKbId: string | null) => {
      setMainView(MainView.Chat);
      useChatStore.getState().setKnowledgeBaseId(nextKbId);
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

  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;
  const chrome = getMainViewChrome(mainView);
  const conversationHeading = conversationTitle?.trim() || undefined;

  return (
    <div className={styles.page}>
      <Header
        title={chrome.headerTitle ?? conversationHeading}
        model={model}
        onModelChange={handleModelChange}
        knowledgeBaseId={knowledgeBaseId}
        knowledgeBaseOptions={kbOptions}
        onKnowledgeBaseChange={handleKnowledgeBaseChange}
        knowledgeBaseDisabled={isGenerating}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
        onClearChat={handleNewChat}
        showMockBadge={USE_MOCK}
        showChatActions={chrome.showChatActions}
      />
      {!USE_MOCK && <ConnectionBanner status={ui.connectionStatus} />}
      <div className={styles.body}>
        <Sidebar
          open={sidebarOpen}
          refreshKey={historyRefreshKey}
          activeConversationId={
            chrome.keepConversationActive ? conversationId : null
          }
          generatingConversationIds={generatingConversationIds}
          modelLabel={modelLabel}
          newChatDisabled={messageCount === 0 && mainView === MainView.Chat}
          libraryActive={mainView === MainView.Library}
          onOpenLibrary={handleOpenLibrary}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onGeneratingSync={handleGeneratingSync}
          onConversationDeleted={handleConversationDeleted}
          onConversationRenamed={handleConversationRenamed}
          onDisconnect={disconnect}
        />
        <div className={styles.mainColumn}>
          <Main>
            {renderMainView(mainView, {
              onSend: sendMessage,
              onStop: stopGeneration,
              onLoadOlder: () => {
                void loadOlderMessages();
              },
            })}
          </Main>
        </div>
      </div>
    </div>
  );
}
