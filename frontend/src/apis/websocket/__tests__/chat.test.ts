import { describe, expect, it } from 'vitest';
import { sendChatMessage } from '../chat';

function fakeClient() {
  const sent: unknown[] = [];
  return {
    sent,
    client: {
      send: (payload: unknown) => {
        sent.push(payload);
        return true;
      },
    },
  };
}

describe('sendChatMessage knowledgeBaseId', () => {
  it('omits knowledgeBaseId when unbound so the server binding wins', () => {
    const { client, sent } = fakeClient();
    sendChatMessage(client as never, '你好', {
      conversationId: 'conv-1',
      knowledgeBaseId: null,
    });
    expect(sent[0]).toEqual({
      type: 'chat',
      content: '你好',
      conversationId: 'conv-1',
    });
  });

  it('sends knowledgeBaseId for lazy bind on a new conversation', () => {
    const { client, sent } = fakeClient();
    sendChatMessage(client as never, '你好', {
      knowledgeBaseId: 'kb-1',
    });
    expect(sent[0]).toEqual({
      type: 'chat',
      content: '你好',
      knowledgeBaseId: 'kb-1',
    });
  });
});
