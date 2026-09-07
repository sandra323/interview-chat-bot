import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from '../retrievalErrors.js';
import type { RerankedHit } from '../retrievalTypes.js';
import {
  RetrievalAbortedError,
  resetRetrieveForChatForTests,
  retrieveForChat,
  setGetKnowledgeBaseForTests,
  setSearchWithRerankForTests,
} from '../retrieveForChat.js';

function hit(): RerankedHit {
  return {
    id: 'c1',
    documentId: 'd1',
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    ownerUsername: 'alice',
    content: '赏花',
    chunkIndex: 0,
    metadata: {},
    embeddingModel: null,
    rrfScore: 1,
    fromVector: true,
    fromKeyword: false,
    vectorRank: 1,
    keywordRank: null,
    relevanceScore: null,
    reranked: false,
  };
}

const kbId = '11111111-1111-4111-8111-111111111111';

describe('retrieveForChat', () => {
  afterEach(() => {
    resetRetrieveForChatForTests();
    vi.useRealTimers();
  });

  it('returns unbound without IO when knowledgeBaseId is null', async () => {
    const search = vi.fn();
    setSearchWithRerankForTests(search as never);
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: null,
      query: 'hi',
    });
    expect(result).toEqual({ kind: 'unbound' });
    expect(search).not.toHaveBeenCalled();
  });

  it('returns hits when search returns chunks', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'alice',
      name: '默认资料库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const hits = [hit(), hit()];
    setSearchWithRerankForTests(async () => hits);
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: kbId,
      query: '赏花',
    });
    expect(result.kind).toBe('hits');
    if (result.kind === 'hits') {
      expect(result.hits).toHaveLength(2);
      expect(result.kb.name).toBe('默认资料库');
    }
  });

  it('returns empty when search returns no hits', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'alice',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => []);
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: kbId,
      query: '小狗狗',
    });
    expect(result).toMatchObject({ kind: 'empty', kb: { id: kbId, name: '库' } });
  });

  it('maps RetrievalUnavailableError to unavailable', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'alice',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => {
      throw new RetrievalUnavailableError();
    });
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: kbId,
      query: '赏花',
    });
    expect(result.kind).toBe('unavailable');
  });

  it('does not search when the knowledge base is missing', async () => {
    const search = vi.fn();
    setGetKnowledgeBaseForTests(async () => null);
    setSearchWithRerankForTests(search as never);
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: kbId,
      query: '赏花',
    });
    expect(result).toEqual({ kind: 'kb_missing', knowledgeBaseId: kbId });
    expect(search).not.toHaveBeenCalled();
  });

  it('treats a malformed id as kb_missing without search', async () => {
    const search = vi.fn();
    setSearchWithRerankForTests(search as never);
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: 'not-a-uuid',
      query: '赏花',
    });
    expect(result.kind).toBe('kb_missing');
    expect(search).not.toHaveBeenCalled();
  });

  it('throws RetrievalAbortedError when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'alice',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await expect(
      retrieveForChat({
        ownerUsername: 'alice',
        knowledgeBaseId: kbId,
        query: '赏花',
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(RetrievalAbortedError);
  });

  it('maps RetrievalQueryError from search to kb_missing', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'alice',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => {
      throw new RetrievalQueryError('bad query');
    });
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: kbId,
      query: '赏花',
    });
    expect(result).toEqual({ kind: 'kb_missing', knowledgeBaseId: kbId });
  });

  it('returns unavailable on timeout', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'alice',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(
      () => new Promise(() => undefined) as Promise<RerankedHit[]>,
    );
    const result = await retrieveForChat({
      ownerUsername: 'alice',
      knowledgeBaseId: kbId,
      query: '赏花',
      timeoutMs: 20,
    });
    expect(result.kind).toBe('unavailable');
  });
});
