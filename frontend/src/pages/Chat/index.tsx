import { useCallback, useEffect, useState } from 'react';
import { message as antdMessage } from 'antd';
import { USE_MOCK } from '@/config/app';
import { MODEL_OPTIONS } from '@/config/models';
import { findProviderByModelId } from '@/config/providers';
import Header from '@/components/Layout/Header';
import Main from '@/components/Layout/Main';
import ConnectionBanner from '@/components/ConnectionBanner';
import { useChatService } from '@/hooks/useChatService';
import { useChatStore } from '@/store/useChatStore';
import { isConfigComplete } from '@/utils/validators';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ConfigPanel from './components/ConfigPanel';
import Sidebar from './components/Sidebar';
import styles from './index.module.less';

export default function ChatPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { sendMessage, reconnect } = useChatService();

  const messages = useChatStore((s) => s.messages);
  const config = useChatStore((s) => s.config);
  const ui = useChatStore((s) => s.ui);
  const setConfig = useChatStore((s) => s.setConfig);
  const setError = useChatStore((s) => s.setError);
  const clearChat = useChatStore((s) => s.clearChat);

  useEffect(() => {
    if (!ui.error) return;
    antdMessage.error(ui.error);
    setError(null);
  }, [ui.error, setError]);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((v) => !v);
  }, []);

  const handleSaveConfig = useCallback(
    (newConfig: typeof config) => {
      setConfig(newConfig);
    },
    [setConfig],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      const provider = findProviderByModelId(model);
      setConfig({
        model,
        ...(provider ? { apiUrl: provider.apiUrl } : {}),
      });
    },
    [setConfig],
  );

  const handleNewChat = useCallback(() => {
    clearChat();
  }, [clearChat]);

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const hasConfig = USE_MOCK || isConfigComplete(config);
  const isInputDisabled =
    ui.loading || (!USE_MOCK && ui.connectionStatus !== 'open');

  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === config.model)?.label ?? config.model;

  const conversationTitle =
    messages.length > 0
      ? messages.find((m) => m.role === 'user')?.content.slice(0, 28) ??
        '当前会话'
      : undefined;

  return (
    <div className={styles.page}>
      <Sidebar
        open={sidebarOpen}
        hasMessages={messages.length > 0}
        modelLabel={modelLabel}
        onNewChat={handleNewChat}
      />
      <div className={styles.mainColumn}>
        <Header
          title={conversationTitle}
          model={config.model}
          onModelChange={handleModelChange}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleSettings={handleToggleSettings}
          onClearChat={clearChat}
          showMockBadge={USE_MOCK}
        />
        {!USE_MOCK && <ConnectionBanner status={ui.connectionStatus} />}
        <Main>
          {showSettings && (
            <ConfigPanel
              config={config}
              onSave={handleSaveConfig}
              onReconnect={reconnect}
            />
          )}
          <section className={styles.chatArea} aria-label="Chat conversation">
            <MessageList
              messages={messages}
              loading={ui.loading}
              hasConfig={hasConfig}
              modelLabel={modelLabel}
              onSuggestion={handleSuggestion}
            />
            <ChatInput
              onSend={sendMessage}
              disabled={isInputDisabled || !hasConfig}
              loading={ui.loading}
            />
          </section>
        </Main>
      </div>
    </div>
  );
}
