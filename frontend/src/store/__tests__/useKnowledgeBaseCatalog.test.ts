import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeBase } from '@ai-chat/shared';
import { fetchKnowledgeBases } from '@/apis/knowledgeBases';
import { useChatStore } from '../useChatStore';
import { useKnowledgeBaseCatalog } from '../useKnowledgeBaseCatalog';

vi.mock('@/apis/knowledgeBases', () => ({
  fetchKnowledgeBases: vi.fn(),
}));

const fetchMock = vi.mocked(fetchKnowledgeBases);

function kb(partial: Partial<KnowledgeBase> & Pick<KnowledgeBase, 'id' | 'name'>): KnowledgeBase {
  return {
    description: '',
    createdAt: 1,
    updatedAt: 2,
    ...partial,
  };
}

describe('useKnowledgeBaseCatalog', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    useKnowledgeBaseCatalog.getState().reset();
  });

  it('load success sets items and ready', async () => {
    const items = [kb({ id: 'a', name: '库A' })];
    fetchMock.mockResolvedValueOnce(items);
    await useKnowledgeBaseCatalog.getState().load();
    expect(useKnowledgeBaseCatalog.getState().items).toEqual(items);
    expect(useKnowledgeBaseCatalog.getState().status).toBe('ready');
  });

  it('load failure keeps previous items and sets error', async () => {
    fetchMock.mockResolvedValueOnce([kb({ id: 'a', name: '库A' })]);
    await useKnowledgeBaseCatalog.getState().load();
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await expect(useKnowledgeBaseCatalog.getState().load()).rejects.toThrow('down');
    expect(useKnowledgeBaseCatalog.getState().items).toHaveLength(1);
    expect(useKnowledgeBaseCatalog.getState().status).toBe('error');
  });

  it('upsert prepends and replaces by id', () => {
    useKnowledgeBaseCatalog.getState().upsert(kb({ id: 'a', name: 'A' }));
    useKnowledgeBaseCatalog.getState().upsert(kb({ id: 'b', name: 'B' }));
    useKnowledgeBaseCatalog.getState().upsert(kb({ id: 'a', name: 'A2' }));
    const names = useKnowledgeBaseCatalog.getState().items.map((item) => item.name);
    expect(names).toEqual(['A2', 'B']);
  });

  it('remove drops the id', () => {
    useKnowledgeBaseCatalog.getState().upsert(kb({ id: 'a', name: 'A' }));
    useKnowledgeBaseCatalog.getState().remove('a');
    expect(useKnowledgeBaseCatalog.getState().items).toEqual([]);
  });

  it('remove clears the chat binding only when the deleted id is selected', () => {
    useChatStore.setState({ knowledgeBaseId: 'a' });
    useKnowledgeBaseCatalog.getState().upsert(kb({ id: 'a', name: 'A' }));
    useKnowledgeBaseCatalog.getState().upsert(kb({ id: 'b', name: 'B' }));

    useKnowledgeBaseCatalog.getState().remove('b');
    expect(useChatStore.getState().knowledgeBaseId).toBe('a');

    useKnowledgeBaseCatalog.getState().remove('a');
    expect(useChatStore.getState().knowledgeBaseId).toBeNull();
  });

  it('ignores a stale load that finishes after a newer load', async () => {
    let resolveFirst: (value: KnowledgeBase[]) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce([kb({ id: 'fresh', name: '新' })]);

    const first = useKnowledgeBaseCatalog.getState().load();
    const second = useKnowledgeBaseCatalog.getState().load();
    await second;
    resolveFirst([kb({ id: 'stale', name: '旧' })]);
    await first;

    expect(useKnowledgeBaseCatalog.getState().items.map((item) => item.id)).toEqual([
      'fresh',
    ]);
    expect(useKnowledgeBaseCatalog.getState().status).toBe('ready');
  });
});
