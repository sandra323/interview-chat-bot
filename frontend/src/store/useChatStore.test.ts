import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, createMessage } from './useChatStore';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      config: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      },
      ui: { loading: false, error: null, connectionStatus: 'closed' },
      _hasHydrated: true,
    });
  });

  it('addMessage appends to array', () => {
    const msg = createMessage('user', 'Hello');
    useChatStore.getState().addMessage(msg);
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0].content).toBe('Hello');
  });

  it('clearChat empties messages but keeps config', () => {
    useChatStore.getState().addMessage(createMessage('user', 'Hi'));
    useChatStore.getState().clearChat();
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().config.apiKey).toBe('sk-test');
  });

  it('setConfig updates config', () => {
    useChatStore.getState().setConfig({ model: 'gpt-4' });
    expect(useChatStore.getState().config.model).toBe('gpt-4');
  });
});
