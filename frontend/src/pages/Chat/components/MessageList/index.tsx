import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Button } from 'antd';
import CatBotIcon from '@/components/CatBotIcon';
import { SUGGESTIONS } from '@/config/models';
import { useChatStore } from '@/store/useChatStore';
import { isNearBottom, scrollToBottom } from '@/utils/scrollHelper';
import MessageBubble from '../MessageBubble';
import TypingIndicator from '../TypingIndicator';
import styles from './index.module.less';

const STICK_THRESHOLD_PX = 30;
const LOAD_OLDER_TOP_PX = 80;

interface MessageListProps {
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
  loading,
  modelLabel,
  onSuggestion,
  scrollContainerRef,
  conversationId,
  hasMoreHistory,
  loadingOlder,
  onLoadOlder,
}: MessageListProps) {
  // Subscribe here so ChatPage chrome is not forced to re-render on every delta.
  const messages = useChatStore((s) => s.messages);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const stickToBottomRef = useRef(true);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isPrependingRef = useRef(false);

  const lastMessage = messages[messages.length - 1];
  /** Stick-to-bottom only when the tail message grows/changes — not on array identity. */
  const stickScrollKey = useMemo(() => {
    if (!lastMessage) return `empty:${loading ? 1 : 0}`;
    return `${lastMessage.id}:${lastMessage.content.length}:${lastMessage.status}`;
  }, [lastMessage, loading]);

  // After switching conversation, jump to latest
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
    if (isPrependingRef.current || loadingOlder) return;
    if (!stickToBottomRef.current) return;

    requestAnimationFrame(() => {
      scrollToBottom(container);
      setShowScrollBtn(false);
    });
  }, [stickScrollKey, loadingOlder, scrollContainerRef]);

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
            <MessageBubble
              key={msg.id}
              message={msg}
              modelLabel={modelLabel}
            />
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
