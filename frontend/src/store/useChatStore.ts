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
  /** Allowlisted model preference only — never stores API keys */
  model: string;
  ui: UIState;
  _hasHydrated: boolean;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setModel: (model: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearChat: () => void;
  setHasHydrated: (value: boolean) => void;
}

/** Drop older persist blobs that may have contained plaintext apiKey */
function scrubLegacyPersistedSecrets(): void {
  try {
    for (const key of [
      'ai-chat-state',
      'ai-chat-state-v3',
      'ai-chat-state-v4',
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
    (set) => ({
      messages: [],
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

      clearChat: () => set({ messages: [] }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'ai-chat-state-v5',
      partialize: (state) => ({
        messages: state.messages,
        model: state.model,
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
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
    status,
  };
}
