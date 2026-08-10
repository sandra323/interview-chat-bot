import { useCallback, useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { isValidMessage } from '@/utils/validators';
import styles from './index.module.less';

interface ChatInputProps {
  onSend: (text: string) => boolean;
  onStop?: () => void;
  disabled: boolean;
  /** True while waiting for reply_start or streaming */
  isGenerating?: boolean;
}

/** Solid stop square — antd has no filled-square stop glyph */
function StopSquareIcon() {
  return <span className={styles.stopIcon} aria-hidden />;
}

export default function ChatInput({
  onSend,
  onStop,
  disabled,
  isGenerating = false,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    if (isGenerating || !isValidMessage(text) || disabled) return;
    const sent = onSend(text);
    if (sent) setText('');
  }, [text, disabled, onSend, isGenerating]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition (e.g. Chinese input confirming English) — Enter must not send
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) handleSend();
    }
  };

  const canSend = isValidMessage(text) && !disabled && !isGenerating;

  return (
    <div className={styles.inputArea}>
      <div className={styles.shell}>
        <Input.TextArea
          id="chat-input"
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，按 Enter 发送，Shift+Enter 换行…"
          disabled={disabled}
          autoSize={{ minRows: 1, maxRows: 6 }}
          maxLength={10000}
          variant="borderless"
          aria-label="Message input"
        />
        {isGenerating ? (
          <Button
            type="primary"
            shape="default"
            icon={<StopSquareIcon />}
            onClick={handleStop}
            className={`${styles.sendBtn} ${styles.sendBtnActive}`}
            aria-label="停止生成"
          />
        ) : (
          <Button
            type="primary"
            shape="default"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!canSend}
            className={`${styles.sendBtn} ${canSend ? styles.sendBtnActive : ''}`}
            aria-label="Send message"
          />
        )}
      </div>
      <p className={styles.disclaimer}>AI 可能会犯错，请核实重要信息</p>
    </div>
  );
}
