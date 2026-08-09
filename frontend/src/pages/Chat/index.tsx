import { useCallback, useEffect, useRef, useState } from 'react';
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
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const { sendMessage } = useChatService();

  const messages = useChatStore((s) => s.messages);
  const model = useChatStore((s) => s.model);
  const ui = useChatStore((s) => s.ui);
  const setModel = useChatStore((s) => s.setModel);
  const setError = useChatStore((s) => s.setError);
  const clearChat = useChatStore((s) => s.clearChat);

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
    clearChat();
  }, [clearChat]);

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const isInputDisabled =
    ui.loading || (!USE_MOCK && ui.connectionStatus !== 'open');

  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;

  const conversationTitle =
    messages.length > 0
      ? messages.find((m) => m.role === 'user')?.content.slice(0, 28) ??
        '当前会话'
      : undefined;

  return (
    <div className={styles.page}>
      <Header
        title={conversationTitle}
        model={model}
        onModelChange={handleModelChange}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onClearChat={clearChat}
        showMockBadge={USE_MOCK}
      />
      {!USE_MOCK && <ConnectionBanner status={ui.connectionStatus} />}
      <div className={styles.body}>
        <Sidebar
          open={sidebarOpen}
          hasMessages={messages.length > 0}
          modelLabel={modelLabel}
          onNewChat={handleNewChat}
        />
        <div className={styles.mainColumn}>
          <Main>
            <section className={styles.chatArea} aria-label="Chat conversation">
              <MessageList
                messages={messages}
                loading={ui.loading}
                modelLabel={modelLabel}
                onSuggestion={handleSuggestion}
                scrollContainerRef={chatScrollRef}
              />
              <ChatInput
                onSend={sendMessage}
                disabled={isInputDisabled}
                loading={ui.loading}
              />
            </section>
          </Main>
        </div>
      </div>
    </div>
  );
}
