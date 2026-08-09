import { useCallback, useEffect, useState, type RefObject } from 'react';
import { Button } from 'antd';
import type { Message } from '@ai-chat/shared';
import CatBotIcon from '@/components/CatBotIcon';
import { SUGGESTIONS } from '@/config/models';
import { isNearBottom, scrollToBottom } from '@/utils/scrollHelper';
import MessageBubble from '../MessageBubble';
import TypingIndicator from '../TypingIndicator';
import styles from './index.module.less';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  modelLabel: string;
  onSuggestion: (text: string) => void;
  /** Chat-only scroll container (sidebar stays fixed) */
  scrollContainerRef: RefObject<HTMLDivElement>;
}

export default function MessageList({
  messages,
  loading,
  modelLabel,
  onSuggestion,
  scrollContainerRef,
}: MessageListProps) {
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowScrollBtn(!isNearBottom(container));
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (isNearBottom(container) || messages.length <= 1) {
      scrollToBottom(container);
      setShowScrollBtn(false);
    }
  }, [messages, loading, scrollContainerRef]);

  const scrollToBottomClick = () => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollToBottom(container);
      setShowScrollBtn(false);
    }
  };

  if (messages.length === 0) {
    return (
      <div
        ref={scrollContainerRef}
        className={styles.empty}
        role="log"
        aria-label="Chat messages"
      >
        <div className={styles.emptyInner}>
          <div className={styles.emptyLogo}>
            <CatBotIcon size={44} />
          </div>
          <h1 className={styles.emptyTitle}>有什么我可以帮您的？</h1>
          <p className={styles.emptySubtitle}>
            基于 {modelLabel} · 支持多轮对话
          </p>
          <div className={styles.suggestions}>
            {SUGGESTIONS.map((text) => (
              <button
                key={text}
                type="button"
                className={styles.suggestion}
                onClick={() => onSuggestion(text)}
                disabled={loading}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollContainerRef}
        className={styles.list}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        <div className={styles.listInner}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && <TypingIndicator />}
        </div>
      </div>
      {showScrollBtn && (
        <Button
          type="primary"
          shape="round"
          className={styles.scrollBtn}
          onClick={scrollToBottomClick}
          aria-label="Scroll to bottom"
        >
          ↓ 新消息
        </Button>
      )}
    </>
  );
}
