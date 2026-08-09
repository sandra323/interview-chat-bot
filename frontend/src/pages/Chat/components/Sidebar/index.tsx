import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import CatBotIcon from '@/components/CatBotIcon';
import styles from './index.module.less';

interface SidebarProps {
  open: boolean;
  hasMessages: boolean;
  modelLabel: string;
  onNewChat: () => void;
}

const STUB_SESSIONS = [
  { id: 'stub-1', title: '量子纠缠原理解释', meta: '示例 · Sonnet' },
  { id: 'stub-2', title: 'Python 快速排序实现', meta: '示例 · Haiku' },
];

export default function Sidebar({
  open,
  hasMessages,
  modelLabel,
  onNewChat,
}: SidebarProps) {
  const shortModel = modelLabel.split(' ').slice(-1)[0] ?? modelLabel;

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}
      aria-hidden={!open}
    >
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logoWell}>
            <CatBotIcon size={30} />
          </div>
          <span className={styles.brandName}>Cat Bot</span>
        </div>

        <div className={styles.newChatWrap}>
          <Button
            block
            icon={<PlusOutlined />}
            className={styles.newChatBtn}
            onClick={onNewChat}
          >
            新建对话
          </Button>
        </div>

        <div className={styles.history}>
          <p className={styles.historyLabel}>历史记录</p>
          <button
            type="button"
            className={`${styles.historyItem} ${styles.historyItemActive}`}
          >
            <p className={styles.historyTitle}>
              {hasMessages ? '当前会话' : '新建对话'}
            </p>
            <p className={styles.historyMeta}>
              {hasMessages ? `本地会话 · ${shortModel}` : '暂无消息'}
            </p>
          </button>
          {STUB_SESSIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.historyItem}
              tabIndex={-1}
              aria-disabled
            >
              <p className={styles.historyTitle}>{item.title}</p>
              <p className={styles.historyMeta}>{item.meta}</p>
            </button>
          ))}
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
