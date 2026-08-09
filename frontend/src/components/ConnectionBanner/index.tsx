import { useEffect, useRef } from 'react';
import { App } from 'antd';
import type { ConnectionStatus } from '@ai-chat/shared';

interface ConnectionBannerProps {
  status: ConnectionStatus;
}

const CONNECTING_KEY = 'ws-connecting';
const CLOSED_KEY = 'ws-closed';

/**
 * Overlay connection toasts via antd Message — no layout shift.
 * Renders nothing into the document flow.
 */
export default function ConnectionBanner({ status }: ConnectionBannerProps) {
  const { message } = App.useApp();
  const prevStatusRef = useRef<ConnectionStatus | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'open') {
      message.destroy(CONNECTING_KEY);
      message.destroy(CLOSED_KEY);
      return;
    }

    if (status === 'connecting') {
      message.destroy(CLOSED_KEY);
      message.open({
        type: 'loading',
        content: '正在连接服务器…',
        key: CONNECTING_KEY,
        duration: 0,
      });
      return;
    }

    // closed — skip initial mount (store starts closed before first connect)
    if (prev === 'open' || prev === 'connecting') {
      message.destroy(CONNECTING_KEY);
      message.open({
        type: 'warning',
        content: '哎呀，和服务器断开了，正在重试…',
        key: CLOSED_KEY,
        duration: 0,
      });
    }
  }, [status, message]);

  useEffect(() => {
    return () => {
      message.destroy(CONNECTING_KEY);
      message.destroy(CLOSED_KEY);
    };
  }, [message]);

  return null;
}
