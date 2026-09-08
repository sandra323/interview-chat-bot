import { create } from 'zustand';
import type { KnowledgeBase } from '@ai-chat/shared';
import { fetchKnowledgeBases } from '@/apis/knowledgeBases';
import { useChatStore } from './useChatStore';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface KnowledgeBaseCatalogState {
  items: KnowledgeBase[];
  status: CatalogStatus;
  error: unknown;
  load: () => Promise<void>;
  upsert: (kb: KnowledgeBase) => void;
  remove: (id: string) => void;
  reset: () => void;
}

let loadGeneration = 0;

/** 内存态知识库目录。Header 与资料库列表同源；不 persist。 */
export const useKnowledgeBaseCatalog = create<KnowledgeBaseCatalogState>(
  (set, get) => ({
    items: [],
    status: 'idle',
    error: null,

    load: async () => {
      const gen = ++loadGeneration;
      const hadItems = get().items.length > 0;
      if (!hadItems) {
        set({ status: 'loading' });
      }
      try {
        const items = await fetchKnowledgeBases();
        if (gen !== loadGeneration) return;
        set({ items, status: 'ready', error: null });
      } catch (error: unknown) {
        if (gen !== loadGeneration) return;
        set({
          status: 'error',
          error,
        });
        throw error;
      }
    },

    upsert: (kb) => {
      const rest = get().items.filter((item) => item.id !== kb.id);
      set({ items: [kb, ...rest] });
    },

    remove: (id) => {
      set({ items: get().items.filter((item) => item.id !== id) });
      if (useChatStore.getState().knowledgeBaseId === id) {
        useChatStore.getState().setKnowledgeBaseId(null);
      }
    },

    reset: () => {
      loadGeneration += 1;
      set({ items: [], status: 'idle', error: null });
    },
  }),
);
