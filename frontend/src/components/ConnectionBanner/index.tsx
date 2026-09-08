import { useEffect, useRef } from 'react';
import { App } from 'antd';

interface ConnectionBannerProps {
  /** 当前自动重试序号；0 表示不提示 */
  reconnectAttempt: number;
}

/**
 * 断线重连：每次自动重试弹出一次短暂 toast（antd 默认时长），
 * 最多 5 次；放弃后不再提示。
 */
export default function ConnectionBanner({
  reconnectAttempt,
}: ConnectionBannerProps) {
  const { message } = App.useApp();
  const lastShownRef = useRef(0);

  useEffect(() => {
    if (reconnectAttempt <= 0) {
      lastShownRef.current = 0;
      return;
    }
    if (reconnectAttempt === lastShownRef.current) {
      return;
    }
    lastShownRef.current = reconnectAttempt;
    message.warning(
      `哎呀，和服务器断开了，正在重试第 ${reconnectAttempt} 次…`,
    );
  }, [message, reconnectAttempt]);

  return null;
}
