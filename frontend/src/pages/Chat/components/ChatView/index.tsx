import { useCallback, useRef } from 'react';
import { USE_MOCK } from '@/config/app';
import { MODEL_OPTIONS } from '@/config/models';
import { useChatStore } from '@/store/useChatStore';
import ChatInput from '../ChatInput';
import MessageList from '../MessageList';
import styles from './index.module.less';

interface ChatViewProps {
  onSend: (text: string) => boolean;
  onStop: () => void;
  onLoadOlder: () => void;
}

export default function ChatView({ onSend, onStop, onLoadOlder }: ChatViewProps) {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const conversationId = useChatStore((s) => s.conversationId);
  const model = useChatStore((s) => s.model);
  const ui = useChatStore((s) => s.ui);
  const history = useChatStore((s) => s.history);
  const hasPendingAssistant = useChatStore((s) =>
    s.messages.some((m) => m.role === 'assistant' && m.status === 'pending'),
  );

  const isGenerating = ui.loading || hasPendingAssistant;
  const isInputDisabled =
    (!USE_MOCK && ui.connectionStatus !== 'open') || history.loading;
  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;

  const handleSuggestion = useCallback(
    (text: string) => {
      onSend(text);
    },
    [onSend],
  );

  return (
    <section className={styles.chatArea} aria-label="Chat conversation">
      <MessageList
        loading={ui.loading && !isGenerating}
        modelLabel={modelLabel}
        onSuggestion={handleSuggestion}
        scrollContainerRef={chatScrollRef}
        conversationId={conversationId}
        hasMoreHistory={history.hasMore}
        loadingOlder={history.loadingMore}
        onLoadOlder={onLoadOlder}
      />
      <ChatInput
        onSend={onSend}
        onStop={onStop}
        disabled={isInputDisabled}
        isGenerating={isGenerating}
      />
    </section>
  );
}
