import type { WebSocketClient } from './client';

/** Chat payload — content + optional allowlisted model. Never includes API keys. */
export function sendChatMessage(
  client: WebSocketClient,
  content: string,
  options?: { model?: string; conversationId?: string },
): boolean {
  return client.send({
    type: 'chat',
    content,
    ...(options?.model ? { model: options.model } : {}),
    ...(options?.conversationId
      ? { conversationId: options.conversationId }
      : {}),
  });
}

export function sendHello(
  client: WebSocketClient,
  conversationId?: string,
): boolean {
  return client.send({
    type: 'hello',
    ...(conversationId ? { conversationId } : {}),
  });
}

export function sendResume(
  client: WebSocketClient,
  params: {
    conversationId: string;
    generationId?: string;
    offset?: number;
  },
): boolean {
  return client.send({
    type: 'resume',
    conversationId: params.conversationId,
    ...(params.generationId ? { generationId: params.generationId } : {}),
    ...(params.offset !== undefined ? { offset: params.offset } : {}),
  });
}

export function sendStop(
  client: WebSocketClient,
  conversationId: string,
  generationId: string,
): boolean {
  return client.send({
    type: 'stop',
    conversationId,
    generationId,
  });
}

export function sendPing(client: WebSocketClient): boolean {
  return client.send({ type: 'ping' });
}
