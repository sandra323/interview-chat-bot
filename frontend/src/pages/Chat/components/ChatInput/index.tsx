import { useCallback, useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { isValidMessage } from '@/utils/validators';
import styles from './index.module.less';

interface ChatInputProps {
  onSend: (text: string) => boolean;
  disabled: boolean;
  loading?: boolean;
}

export default function ChatInput({
  onSend,
  disabled,
  loading = false,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    if (!isValidMessage(text) || disabled) return;
    const sent = onSend(text);
    if (sent) setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = isValidMessage(text) && !disabled;

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
        <Button
          type="primary"
          shape="default"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!canSend}
          loading={loading}
          className={`${styles.sendBtn} ${canSend ? styles.sendBtnActive : ''}`}
          aria-label="Send message"
        />
      </div>
      <p className={styles.disclaimer}>AI 可能会犯错，请核实重要信息</p>
    </div>
  );
}
