import { Button, Modal, Select, Tag } from 'antd';
import {
  ClearOutlined,
  MenuOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { MODEL_OPTIONS } from '@/config/models';
import styles from './index.module.less';

interface HeaderProps {
  title?: string;
  model: string;
  onModelChange: (model: string) => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onClearChat: () => void;
  showMockBadge?: boolean;
}

export default function Header({
  title,
  model,
  onModelChange,
  onToggleSidebar,
  onToggleSettings,
  onClearChat,
  showMockBadge = false,
}: HeaderProps) {
  const handleClear = () => {
    Modal.confirm({
      title: '清空对话',
      content: '确定清空当前会话中的所有消息吗？',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => onClearChat(),
    });
  };

  const selectOptions = MODEL_OPTIONS.some((m) => m.id === model)
    ? MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label }))
    : [
        { value: model, label: model },
        ...MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label })),
      ];

  return (
    <header className={styles.header}>
      <Button
        type="text"
        icon={<MenuOutlined />}
        onClick={onToggleSidebar}
        className={styles.iconBtn}
        aria-label="Toggle sidebar"
      />

      <div className={styles.titleBlock}>
        {title ? (
          <p className={styles.title}>{title}</p>
        ) : (
          <p className={styles.titleMuted}>新建对话</p>
        )}
        {showMockBadge && (
          <Tag color="processing" className={styles.mockBadge}>
            Mock 预览
          </Tag>
        )}
      </div>

      <div className={styles.actions}>
        <Select
          value={model}
          onChange={onModelChange}
          className={styles.modelSelect}
          popupMatchSelectWidth={240}
          optionLabelProp="label"
          options={selectOptions}
          optionRender={(option) => {
            const badge = MODEL_OPTIONS.find(
              (m) => m.id === option.value,
            )?.badge;
            return (
              <div className={styles.modelOption}>
                <span className={styles.modelDot} />
                <span className={styles.modelLabel}>{option.label}</span>
                {badge ? (
                  <Tag className={styles.modelBadge}>{badge}</Tag>
                ) : null}
              </div>
            );
          }}
        />
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={onToggleSettings}
          className={styles.iconBtn}
          aria-label="Toggle settings panel"
        />
        <Button
          type="text"
          icon={<ClearOutlined />}
          onClick={handleClear}
          className={styles.iconBtn}
          aria-label="Clear chat history"
        />
      </div>
    </header>
  );
}
