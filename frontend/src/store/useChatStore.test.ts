import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, createMessage } from './useChatStore';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      conversationId: null,
      model: 'deepseek-v4-flash',
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

  it('clearChat empties messages but keeps model', () => {
    useChatStore.getState().addMessage(createMessage('user', 'Hi'));
    useChatStore.getState().clearChat();
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().model).toBe('deepseek-v4-flash');
  });

  it('setModel updates model', () => {
    useChatStore.getState().setModel('deepseek-v4-pro');
    expect(useChatStore.getState().model).toBe('deepseek-v4-pro');
  });
});
