import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Avatar, Button, Dropdown, Input, Modal, message as antdMessage } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  LogoutOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { logout } from '@/apis/auth';
import {
  deleteConversation,
  fetchConversations,
  renameConversation,
  type ConversationListItem,
} from '@/apis/conversations';
import { useAuthStore } from '@/store/useAuthStore';
import { displayConversationTitle } from '@/utils/conversationTitle';
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
  /** Active chat was deleted — parent should clear local session */
  onConversationDeleted?: (conversationId: string) => void;
  /** Active chat was renamed — parent should update header title */
  onConversationRenamed?: (conversationId: string, title: string) => void;
  /** Disconnect live WS before clearing auth (no-op in mock) */
  onDisconnect?: () => void;
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
  onConversationDeleted,
  onConversationRenamed,
  onDisconnect,
}: SidebarProps) {
  // App.useApp() modal inherits ConfigProvider dark theme (static Modal.confirm does not)
  const { modal } = App.useApp();
  const username = useAuthStore((s) => s.username) || '用户';
  const forceLogoutLocal = useAuthStore((s) => s.forceLogoutLocal);
  const avatarChar = username.trim().charAt(0).toUpperCase() || '用';
  const shortModel = modelLabel.split(' ').slice(-1)[0] ?? modelLabel;
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ConversationListItem | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const onGeneratingSyncRef = useRef(onGeneratingSync);
  onGeneratingSyncRef.current = onGeneratingSync;
  const historyEpochRef = useRef(0);

  // Stable callback so refreshKey is the only intentional refetch trigger
  const loadHistory = useCallback(async () => {
    const epoch = ++historyEpochRef.current;
    setLoading(true);
    try {
      const list = await fetchConversations();
      if (epoch !== historyEpochRef.current) return;
      setItems(list);
      onGeneratingSyncRef.current?.(
        list.filter((item) => item.generating).map((item) => item.id),
      );
    } catch (error) {
      if (epoch !== historyEpochRef.current) return;
      const msg =
        error instanceof Error
          ? error.message
          : '哎呀，历史记录加载失败了，请稍后重试';
      antdMessage.error(msg);
    } finally {
      if (epoch === historyEpochRef.current) {
        setLoading(false);
      }
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

  const openRename = useCallback((item: ConversationListItem) => {
    setRenameTarget(item);
    setRenameValue(item.title);
  }, []);

  const handleRenameOk = useCallback(async () => {
    if (!renameTarget || renameSaving) {
      return Promise.reject(new Error('busy'));
    }
    const next = renameValue.trim();
    if (!next) {
      antdMessage.warning('标题不能为空');
      return Promise.reject(new Error('empty title'));
    }
    setRenameSaving(true);
    try {
      const result = await renameConversation(renameTarget.id, next);
      historyEpochRef.current += 1;
      setItems((prev) =>
        prev.map((item) =>
          item.id === result.id ? { ...item, title: result.title } : item,
        ),
      );
      onConversationRenamed?.(result.id, result.title);
      setRenameTarget(null);
    } catch (error) {
      antdMessage.error(
        error instanceof Error ? error.message : '哎呀，重命名失败了，请稍后重试',
      );
      return Promise.reject(error);
    } finally {
      setRenameSaving(false);
    }
  }, [renameTarget, renameValue, renameSaving, onConversationRenamed]);

  const handleDelete = useCallback(
    (item: ConversationListItem) => {
      modal.confirm({
        title: '删除对话',
        content: '删除后无法恢复，确定删除这个对话吗？',
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        cancelButtonProps: { type: 'default' },
        onOk: async () => {
          try {
            await deleteConversation(item.id);
            historyEpochRef.current += 1;
            setItems((prev) => prev.filter((row) => row.id !== item.id));
            onConversationDeleted?.(item.id);
          } catch (error) {
            antdMessage.error(
              error instanceof Error
                ? error.message
                : '哎呀，删除失败了，请稍后重试',
            );
            throw error;
          }
        },
      });
    },
    [modal, onConversationDeleted],
  );

  const handleLogout = useCallback(() => {
    modal.confirm({
      title: '退出登录',
      content: '确定退出当前登录吗？本地对话界面会被清空，服务端历史仍会保留。',
      okText: '退出登录',
      cancelText: '取消',
      okButtonProps: { danger: true },
      cancelButtonProps: { type: 'default' },
      onOk: async () => {
        try {
          await logout();
        } catch {
          // Best-effort: still clear local session below.
        } finally {
          onDisconnect?.();
          forceLogoutLocal({ reason: 'logout' });
        }
      },
    });
  }, [modal, onDisconnect, forceLogoutLocal]);

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
            const menuOpen = menuOpenId === item.id;
            const titleDisplay = displayConversationTitle(item.title);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`${styles.historyItem} ${
                  active ? styles.historyItemActive : ''
                } ${menuOpen ? styles.historyItemMenuOpen : ''}`}
                onClick={() => {
                  if (!active) onSelectConversation(item.id, item.title);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!active) onSelectConversation(item.id, item.title);
                  }
                }}
                aria-current={active ? 'true' : undefined}
              >
                <div className={styles.historyTitleRow}>
                  <p className={styles.historyTitle} title={titleDisplay}>
                    {titleDisplay}
                  </p>
                  {generating ? (
                    <span
                      className={styles.generatingDot}
                      title="正在生成"
                      aria-label="正在生成"
                    />
                  ) : null}
                </div>
                <div className={styles.historyMetaRow}>
                  <p className={styles.historyMeta}>
                    {generating ? '生成中 · ' : ''}
                    {formatUpdatedAt(item.updatedAt)}
                    {active ? ` · ${shortModel}` : ''}
                  </p>
                  <Dropdown
                    trigger={['click']}
                    open={menuOpen}
                    onOpenChange={(next) =>
                      setMenuOpenId(next ? item.id : null)
                    }
                    menu={{
                      items: [
                        {
                          key: 'rename',
                          icon: <EditOutlined />,
                          label: '重命名',
                          onClick: ({ domEvent }) => {
                            domEvent.stopPropagation();
                            openRename(item);
                          },
                        },
                        {
                          key: 'delete',
                          icon: <DeleteOutlined />,
                          label: '删除',
                          danger: true,
                          onClick: ({ domEvent }) => {
                            domEvent.stopPropagation();
                            handleDelete(item);
                          },
                        },
                      ],
                    }}
                  >
                    <button
                      type="button"
                      className={styles.moreBtn}
                      aria-label="更多操作"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EllipsisOutlined />
                    </button>
                  </Dropdown>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.userCard}>
          <Dropdown
            trigger={['click']}
            placement="topRight"
            getPopupContainer={(node) =>
              node.parentElement ?? document.body
            }
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  danger: true,
                  onClick: () => handleLogout(),
                },
              ],
            }}
          >
            <button type="button" className={styles.userCardTrigger}>
              <Avatar
                size={28}
                style={{ background: 'var(--gradient-cta)', fontSize: 12 }}
              >
                {avatarChar}
              </Avatar>
              <div className={styles.userMeta}>
                <p className={styles.userName}>{username}</p>
                <p className={styles.userPlan}>免费版</p>
              </div>
              <EllipsisOutlined className={styles.userMore} aria-hidden />
            </button>
          </Dropdown>
        </div>
      </div>

      <Modal
        title="重命名"
        open={Boolean(renameTarget)}
        okText="确定"
        cancelText="取消"
        confirmLoading={renameSaving}
        destroyOnHidden
        onCancel={() => {
          if (!renameSaving) setRenameTarget(null);
        }}
        onOk={() => handleRenameOk()}
      >
        <Input
          value={renameValue}
          maxLength={100}
          autoFocus
          placeholder="请输入新的对话名称"
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={() => {
            if (renameSaving) return;
            void handleRenameOk();
          }}
        />
      </Modal>
    </aside>
  );
}
