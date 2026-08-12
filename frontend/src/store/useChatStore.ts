import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MODEL_ID, type ConnectionStatus, type Message } from '@ai-chat/shared';
import { newId } from '@/utils/id';

interface UIState {
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
}

interface HistoryState {
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
}

interface ChatState {
  messages: Message[];
  /** Server-side conversation; persisted for resume across refresh */
  conversationId: string | null;
  /**
   * Sidebar-aligned title (first user message). Persisted so Header stays
   * correct even when only the newest message page is loaded.
   */
  conversationTitle: string | null;
  /** Allowlisted model preference only — never stores API keys */
  model: string;
  ui: UIState;
  /** Ephemeral pagination meta for history (not persisted) */
  history: HistoryState;
  /**
   * Conversation ids with in-flight generation (local optimistic + switch-away).
   * Not persisted — sidebar also trusts server `generating` on refresh.
   */
  generatingConversationIds: string[];
  _hasHydrated: boolean;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendMessageContent: (id: string, delta: string) => void;
  setMessages: (messages: Message[]) => void;
  prependMessages: (messages: Message[]) => void;
  setConversationId: (id: string | null) => void;
  setConversationTitle: (title: string | null) => void;
  setModel: (model: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setHistory: (partial: Partial<HistoryState>) => void;
  markConversationGenerating: (id: string) => void;
  clearConversationGenerating: (id: string) => void;
  syncGeneratingFromServer: (serverGeneratingIds: string[]) => void;
  clearChat: () => void;
  setHasHydrated: (value: boolean) => void;
  getPendingAssistant: () => Message | undefined;
}

const INITIAL_HISTORY: HistoryState = {
  page: 0,
  hasMore: false,
  loading: false,
  loadingMore: false,
};

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
      conversationTitle: null,
      model: DEFAULT_MODEL_ID,
      ui: {
        loading: false,
        error: null,
        connectionStatus: 'closed',
      },
      history: { ...INITIAL_HISTORY },
      generatingConversationIds: [],
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

      setMessages: (messages) => set({ messages }),

      prependMessages: (messages) =>
        set((state) => {
          const existingIds = new Set(state.messages.map((m) => m.id));
          const unique = messages.filter((m) => !existingIds.has(m.id));
          if (unique.length === 0) return state;
          return { messages: [...unique, ...state.messages] };
        }),

      setConversationId: (conversationId) => set({ conversationId }),

      setConversationTitle: (conversationTitle) => set({ conversationTitle }),

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

      setHistory: (partial) =>
        set((state) => ({
          history: { ...state.history, ...partial },
        })),

      markConversationGenerating: (id) =>
        set((state) => {
          if (state.generatingConversationIds.includes(id)) return state;
          return {
            generatingConversationIds: [
              ...state.generatingConversationIds,
              id,
            ],
          };
        }),

      clearConversationGenerating: (id) =>
        set((state) => ({
          generatingConversationIds: state.generatingConversationIds.filter(
            (x) => x !== id,
          ),
        })),

      /** Merge server truth: keep local-only ids that server still reports, drop finished */
      syncGeneratingFromServer: (serverGeneratingIds) =>
        set(() => ({
          generatingConversationIds: [...new Set(serverGeneratingIds)],
        })),

      clearChat: () =>
        set({
          messages: [],
          conversationId: null,
          conversationTitle: null,
          history: { ...INITIAL_HISTORY },
        }),

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
      name: 'ai-chat-state-v7',
      partialize: (state) => ({
        messages: state.messages,
        model: state.model,
        conversationId: state.conversationId,
        conversationTitle: state.conversationTitle,
      }),
      onRehydrateStorage: () => (state) => {
        if (
          state &&
          !state.conversationTitle &&
          state.messages.length > 0
        ) {
          const firstUser = state.messages.find((m) => m.role === 'user');
          if (firstUser?.content.trim()) {
            state.conversationTitle = firstUser.content.trim();
          }
        }
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
    id: id ?? newId(),
    role,
    content,
    timestamp: Date.now(),
    status,
  };
}
