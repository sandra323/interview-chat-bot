import { memo } from 'react';
import { Button, message as antdMessage } from 'antd';
import { Streamdown } from 'streamdown';
import type { Message } from '@ai-chat/shared';
import CatBotIcon from '@/components/CatBotIcon';
import { formatTime } from '@/utils/formatTime';
import styles from './index.module.less';

interface MessageBubbleProps {
  message: Message;
  /** Resolved label from parent — avoids every bubble subscribing to the store. */
  modelLabel: string;
}

function MessageBubble({ message, modelLabel }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isPending = message.status === 'pending';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      antdMessage.success('已复制');
    } catch {
      antdMessage.error('哎呀，复制失败了，请稍后重试');
    }
  };

  if (isUser) {
    return (
      <div className={`${styles.wrapper} ${styles.userWrapper}`}>
        <div className={styles.userBubble} aria-label="Your message">
          {message.content}
        </div>
        <time
          className={styles.userTime}
          dateTime={new Date(message.timestamp).toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    );
  }

  return (
    <div className={`${styles.wrapper} ${styles.assistantWrapper}`}>
      <div className={styles.avatar}>
        <CatBotIcon size={30} />
      </div>
      <div className={styles.assistantBody}>
        <div className={styles.meta}>
          <span className={styles.modelName}>{modelLabel}</span>
          <time
            className={styles.metaTime}
            dateTime={new Date(message.timestamp).toISOString()}
          >
            {formatTime(message.timestamp)}
          </time>
        </div>
        <div
          className={`${styles.markdown} ${isPending ? styles.streaming : ''}`}
          aria-label="AI message"
        >
          {message.content ? (
            <Streamdown
              className={styles.streamdown}
              mode={isPending ? 'streaming' : 'static'}
              parseIncompleteMarkdown
              isAnimating={isPending}
              controls={{ code: { copy: true, download: false } }}
            >
              {message.content}
            </Streamdown>
          ) : isPending ? (
            <span className={styles.pendingHint}>正在生成…</span>
          ) : null}
          {isPending && message.content ? (
            <span className={styles.cursor} aria-hidden />
          ) : null}
        </div>
        {!isPending ? (
          <div className={styles.actions}>
            <Button type="text" size="small" onClick={handleCopy}>
              复制
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Same message object reference → skip re-render while a sibling streams. */
export default memo(MessageBubble);
