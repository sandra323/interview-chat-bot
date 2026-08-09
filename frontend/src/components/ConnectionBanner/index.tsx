import { Alert } from 'antd';
import type { ConnectionStatus } from '@ai-chat/shared';
import styles from './index.module.less';

interface ConnectionBannerProps {
  status: ConnectionStatus;
}

export default function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'open') return null;

  const isConnecting = status === 'connecting';

  return (
    <Alert
      className={styles.banner}
      type={isConnecting ? 'info' : 'warning'}
      showIcon
      banner
      message={
        isConnecting
          ? '正在连接服务器…'
          : '哎呀，和服务器断开了，正在重试…'
      }
    />
  );
}
