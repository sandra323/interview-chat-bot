import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL_ID, type ConnectionStatus, type Message } from '@ai-chat/shared';

interface UIState {
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
}

interface ChatState {
  messages: Message[];
  /** Server-side conversation; persisted for resume across refresh */
  conversationId: string | null;
  /** Allowlisted model preference only — never stores API keys */
  model: string;
  ui: UIState;
  _hasHydrated: boolean;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendMessageContent: (id: string, delta: string) => void;
  setConversationId: (id: string | null) => void;
  setModel: (model: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearChat: () => void;
  setHasHydrated: (value: boolean) => void;
  getPendingAssistant: () => Message | undefined;
}

/** Drop older persist blobs that may have contained plaintext apiKey */
function scrubLegacyPersistedSecrets(): void {
  try {
    for (const key of [
      'ai-chat-state',
      'ai-chat-state-v3',
      'ai-chat-state-v4',
      'ai-chat-state-v5',
      'ai-chat-api-key-session',
    ]) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

scrubLegacyPersistedSecrets();

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      conversationId: null,
      model: DEFAULT_MODEL_ID,
      ui: {
        loading: false,
        error: null,
        connectionStatus: 'closed',
      },
      _hasHydrated: false,

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg,
          ),
        })),

      appendMessageContent: (id, delta) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, content: msg.content + delta } : msg,
          ),
        })),

      setConversationId: (conversationId) => set({ conversationId }),

      setModel: (model) => set({ model }),

      setLoading: (loading) =>
        set((state) => ({
          ui: { ...state.ui, loading },
        })),

      setError: (error) =>
        set((state) => ({
          ui: { ...state.ui, error },
        })),

      setConnectionStatus: (connectionStatus) =>
        set((state) => ({
          ui: { ...state.ui, connectionStatus },
        })),

      clearChat: () => set({ messages: [], conversationId: null }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),

      getPendingAssistant: () => {
        const { messages } = get();
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const msg = messages[i];
          if (msg.role === 'assistant' && msg.status === 'pending') {
            return msg;
          }
        }
        return undefined;
      },
    }),
    {
      name: 'ai-chat-state-v6',
      partialize: (state) => ({
        messages: state.messages,
        model: state.model,
        conversationId: state.conversationId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function createMessage(
  role: Message['role'],
  content: string,
  status: Message['status'] = 'sent',
  id?: string,
): Message {
  return {
    id: id ?? crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
    status,
  };
}
