import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Config, ConnectionStatus, Message } from '@ai-chat/shared';

interface UIState {
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
}

interface ChatState {
  messages: Message[];
  config: Config;
  ui: UIState;
  _hasHydrated: boolean;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setConfig: (config: Partial<Config>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearChat: () => void;
  setHasHydrated: (value: boolean) => void;
}

const defaultConfig: Config = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      config: defaultConfig,
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

      setConfig: (config) =>
        set((state) => ({
          config: { ...state.config, ...config },
        })),

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
      name: 'ai-chat-state',
      partialize: (state) => ({
        messages: state.messages,
        config: state.config,
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
