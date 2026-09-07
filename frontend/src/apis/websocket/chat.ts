import type { WebSocketClient } from './client';

/** 聊天 payload —— 内容 + 可选白名单 model。绝不包含 API key。 */
export function sendChatMessage(
  client: WebSocketClient,
  content: string,
  options?: {
    model?: string;
    conversationId?: string;
    knowledgeBaseId?: string | null;
  },
): boolean {
  return client.send({
    type: 'chat',
    content,
    ...(options?.model ? { model: options.model } : {}),
    ...(options?.conversationId
      ? { conversationId: options.conversationId }
      : {}),
    ...(options?.knowledgeBaseId
      ? { knowledgeBaseId: options.knowledgeBaseId }
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
