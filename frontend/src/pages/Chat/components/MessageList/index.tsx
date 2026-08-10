import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Button } from 'antd';
import type { Message } from '@ai-chat/shared';
import CatBotIcon from '@/components/CatBotIcon';
import { SUGGESTIONS } from '@/config/models';
import { isNearBottom, scrollToBottom } from '@/utils/scrollHelper';
import MessageBubble from '../MessageBubble';
import TypingIndicator from '../TypingIndicator';
import styles from './index.module.less';

const STICK_THRESHOLD_PX = 30;
const LOAD_OLDER_TOP_PX = 80;

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  modelLabel: string;
  onSuggestion: (text: string) => void;
  /** Chat-only scroll container (sidebar stays fixed) */
  scrollContainerRef: RefObject<HTMLDivElement>;
  /** Reset stick-to-bottom when switching conversations */
  conversationId: string | null;
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}

export default function MessageList({
  messages,
  loading,
  modelLabel,
  onSuggestion,
  scrollContainerRef,
  conversationId,
  hasMoreHistory,
  loadingOlder,
  onLoadOlder,
}: MessageListProps) {
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const stickToBottomRef = useRef(true);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isPrependingRef = useRef(false);

  // After switching conversation, jump to latest (do not depend on messages.length)
  useEffect(() => {
    stickToBottomRef.current = true;
    isPrependingRef.current = false;
    prevScrollHeightRef.current = null;
    setShowScrollBtn(false);
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;
    requestAnimationFrame(() => {
      scrollToBottom(container);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on conversation switch
  }, [conversationId, scrollContainerRef]);

  // Snapshot height when older-page fetch starts; restore after prepend
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (loadingOlder && container) {
      isPrependingRef.current = true;
      prevScrollHeightRef.current = container.scrollHeight;
    }
  }, [loadingOlder, scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const prevHeight = prevScrollHeightRef.current;
    if (!container || loadingOlder || prevHeight == null) return;
    container.scrollTop += container.scrollHeight - prevHeight;
    prevScrollHeightRef.current = null;
    isPrependingRef.current = false;
  }, [messages, loadingOlder, scrollContainerRef]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom = isNearBottom(container, STICK_THRESHOLD_PX);
    stickToBottomRef.current = nearBottom;
    setShowScrollBtn(!nearBottom);

    if (
      container.scrollTop < LOAD_OLDER_TOP_PX &&
      hasMoreHistory &&
      !loadingOlder
    ) {
      onLoadOlder();
    }
  }, [scrollContainerRef, hasMoreHistory, loadingOlder, onLoadOlder]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Do not fight scroll restoration while prepending older pages
    if (isPrependingRef.current || loadingOlder) return;
    if (!stickToBottomRef.current) return;

    requestAnimationFrame(() => {
      scrollToBottom(container);
      setShowScrollBtn(false);
    });
  }, [messages, loading, loadingOlder, scrollContainerRef]);

  const scrollToBottomClick = () => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollToBottom(container);
      stickToBottomRef.current = true;
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
          {hasMoreHistory || loadingOlder ? (
            <p className={styles.loadOlder} aria-live="polite">
              {loadingOlder ? '加载更早的消息…' : '向上滚动加载更早消息'}
            </p>
          ) : null}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && <TypingIndicator />}
        </div>
      </div>
      {showScrollBtn && (
        <Button
          type="primary"
          shape="circle"
          className={styles.scrollBtn}
          onClick={scrollToBottomClick}
          aria-label="Scroll to bottom"
        >
          ↓
        </Button>
      )}
    </>
  );
}
