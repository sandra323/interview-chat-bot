import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, message as antdMessage } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  fetchConversations,
  type ConversationListItem,
} from '@/apis/conversations';
import { truncateConversationTitle } from '@/utils/conversationTitle';
import styles from './index.module.less';

interface SidebarProps {
  open: boolean;
  /** Bump to refetch history (e.g. after send / new chat) */
  refreshKey?: number;
  activeConversationId: string | null;
  /** Local optimistic generating ids (in addition to server flag) */
  generatingConversationIds: string[];
  modelLabel: string;
  /** Disable when current chat is already empty */
  newChatDisabled?: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversationId: string, title: string) => void;
  /** Sync local generating markers from server list */
  onGeneratingSync?: (serverGeneratingIds: string[]) => void;
}

function formatUpdatedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function Sidebar({
  open,
  refreshKey = 0,
  activeConversationId,
  generatingConversationIds,
  modelLabel,
  newChatDisabled = false,
  onNewChat,
  onSelectConversation,
  onGeneratingSync,
}: SidebarProps) {
  const shortModel = modelLabel.split(' ').slice(-1)[0] ?? modelLabel;
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const onGeneratingSyncRef = useRef(onGeneratingSync);
  onGeneratingSyncRef.current = onGeneratingSync;

  // Stable callback so refreshKey is the only intentional refetch trigger
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchConversations();
      setItems(list);
      onGeneratingSyncRef.current?.(
        list.filter((item) => item.generating).map((item) => item.id),
      );
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : '哎呀，历史记录加载失败了，请稍后重试';
      antdMessage.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, refreshKey]);

  // While any conversation is generating in the background, poll so the
  // sidebar indicator clears when the job finishes without switching back.
  const hasGenerating =
    generatingConversationIds.length > 0 ||
    items.some((item) => item.generating);

  useEffect(() => {
    if (!hasGenerating) return;
    const timer = window.setInterval(() => {
      void loadHistory();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasGenerating, loadHistory]);

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}
      aria-hidden={!open}
    >
      <div className={styles.inner}>
        <div className={styles.newChatWrap}>
          <Button
            block
            icon={<PlusOutlined />}
            className={styles.newChatBtn}
            onClick={onNewChat}
            disabled={newChatDisabled}
          >
            新建对话
          </Button>
        </div>

        <div className={styles.history}>
          <p className={styles.historyLabel}>历史记录</p>
          {loading && items.length === 0 ? (
            <p className={styles.historyEmpty}>加载中…</p>
          ) : null}
          {!loading && items.length === 0 ? (
            <p className={styles.historyEmpty}>暂无历史会话</p>
          ) : null}
          {items.map((item) => {
            const active = item.id === activeConversationId;
            const generating =
              Boolean(item.generating) ||
              generatingConversationIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.historyItem} ${
                  active ? styles.historyItemActive : ''
                }`}
                onClick={() => {
                  if (!active) onSelectConversation(item.id, item.title);
                }}
                aria-current={active ? 'true' : undefined}
              >
                <div className={styles.historyTitleRow}>
                  <p className={styles.historyTitle}>
                    {truncateConversationTitle(item.title)}
                  </p>
                  {generating ? (
                    <span
                      className={styles.generatingDot}
                      title="正在生成"
                      aria-label="正在生成"
                    />
                  ) : null}
                </div>
                <p className={styles.historyMeta}>
                  {generating ? '生成中 · ' : ''}
                  {formatUpdatedAt(item.updatedAt)}
                  {active ? ` · ${shortModel}` : ''}
                </p>
              </button>
            );
          })}
        </div>

        <div className={styles.userCard}>
          <div className={styles.avatar}>用</div>
          <div>
            <p className={styles.userName}>用户</p>
            <p className={styles.userPlan}>免费版</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
