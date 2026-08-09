import { useCallback, useEffect, useRef, useState } from 'react';
import { WebSocketClient } from '@/apis/websocket/client';
import type { WebSocketStatus } from '@/apis/websocket/client';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: string) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
  autoConnect?: boolean;
}

export function useWebSocket({
  url,
  onMessage,
  onStatusChange,
  autoConnect = true,
}: UseWebSocketOptions) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>('closed');

  useEffect(() => {
    const client = new WebSocketClient(url);
    clientRef.current = client;

    client.onMessage((data) => {
      onMessage?.(data);
    });

    client.onStatusChange((newStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    });

    if (autoConnect) {
      client.connect();
    }

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((message: Parameters<WebSocketClient['send']>[0]) => {
    return clientRef.current?.send(message) ?? false;
  }, []);

  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  return { status, send, connect, disconnect };
}
