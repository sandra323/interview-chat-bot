import type { WebSocketClient } from './client';

/** Chat payload — content + optional allowlisted model. Never includes API keys. */
export function sendChatMessage(
  client: WebSocketClient,
  content: string,
  model?: string,
): boolean {
  return client.send({
    type: 'chat',
    content,
    ...(model ? { model } : {}),
  });
}

export function sendPing(client: WebSocketClient): boolean {
  return client.send({ type: 'ping' });
}
