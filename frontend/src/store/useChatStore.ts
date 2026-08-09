import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Config, ConnectionStatus, Message } from '@ai-chat/shared';
import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_API_URL,
  DEFAULT_MODEL,
} from '@/config/app';

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
  apiUrl: DEEPSEEK_API_URL,
  apiKey: DEEPSEEK_API_KEY,
  model: DEFAULT_MODEL,
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
      // bump when default provider/model changes so stale localStorage is dropped
      name: 'ai-chat-state-v3',
      partialize: (state) => ({
        messages: state.messages,
        config: state.config,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const patch: Partial<Config> = {};
        if (!state.config.apiKey && DEEPSEEK_API_KEY) {
          patch.apiKey = DEEPSEEK_API_KEY;
        }
        if (
          !state.config.apiUrl ||
          state.config.apiUrl.includes('api.openai.com')
        ) {
          patch.apiUrl = DEEPSEEK_API_URL;
        }
        if (
          !state.config.model ||
          state.config.model.startsWith('gpt-') ||
          state.config.model.startsWith('claude-')
        ) {
          patch.model = DEFAULT_MODEL;
        }
        if (Object.keys(patch).length > 0) {
          state.setConfig(patch);
        }
        state.setHasHydrated(true);
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
