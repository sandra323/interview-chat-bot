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
  /** 服务端对话；持久化以便刷新后 resume */
  conversationId: string | null;
  /**
   * 与侧栏对齐的标题（首条用户消息）。持久化以便
   * 仅加载最新消息页时 Header 仍正确。
   */
  conversationTitle: string | null;
  /** 仅白名单 model 偏好 —— 绝不存储 API key */
  model: string;
  ui: UIState;
  /** 历史分页元数据（不持久化） */
  history: HistoryState;
  /**
   * 进行中的 generation 对话 id（本地乐观 + 切走保留）。
   * 不持久化 —— 刷新后侧栏亦信任服务端 `generating`。
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

/** 清除可能含明文 apiKey 的旧 persist 数据 */
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
    // 忽略
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

      /** 合并服务端真相：保留服务端仍报告的本地 id，丢弃已结束项 */
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
