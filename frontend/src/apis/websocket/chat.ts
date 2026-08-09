import type { Config } from '@ai-chat/shared';
import type { WebSocketClient } from './client';

export function sendChatMessage(
  client: WebSocketClient,
  content: string,
  config: Config,
): boolean {
  return client.send({
    type: 'chat',
    content,
    config,
  });
}

export function sendPing(client: WebSocketClient): boolean {
  return client.send({ type: 'ping' });
}
