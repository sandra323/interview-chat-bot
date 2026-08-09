import type { ReactNode } from 'react';
import { Button, message as antdMessage } from 'antd';
import type { Message } from '@ai-chat/shared';
import CatBotIcon from '@/components/CatBotIcon';
import { formatTime } from '@/utils/formatTime';
import { useChatStore } from '@/store/useChatStore';
import { MODEL_OPTIONS } from '@/config/models';
import styles from './index.module.less';

interface MessageBubbleProps {
  message: Message;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className={styles.strong}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className={styles.inlineCode}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      elements.push(
        <div key={`code-${i}`} className={styles.codeBlock}>
          {lang ? <div className={styles.codeLang}>{lang}</div> : null}
          <pre className={styles.codePre}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={`li-${i}`} className={styles.listItem}>
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (line.trim() === '') {
      elements.push(<div key={`sp-${i}`} className={styles.spacer} />);
    } else {
      elements.push(
        <p key={`p-${i}`} className={styles.paragraph}>
          {renderInline(line)}
        </p>,
      );
    }
    i += 1;
  }

  return <div className={styles.markdown}>{elements}</div>;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const model = useChatStore((s) => s.model);
  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;

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
        <div aria-label="AI message">
          <MarkdownContent text={message.content} />
        </div>
        <div className={styles.actions}>
          <Button type="text" size="small" onClick={handleCopy}>
            复制
          </Button>
        </div>
      </div>
    </div>
  );
}
