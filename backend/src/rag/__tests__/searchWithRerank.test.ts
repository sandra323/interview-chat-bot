import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../../config/env.js';
import { sha256Hex } from '../contentHash.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  EMBED_DIM,
  RERANK_TOP_N,
} from '../chunkConfig.js';
import { createKnowledgeBase } from '../knowledgeBaseStore.js';
import { insert } from '../pgDocumentStore.js';
import { getPool, initPg, resetPoolForTests } from '../pg.js';
import { replaceForDocument } from '../chunkStore.js';
import {
  createDeterministicEmbedding,
  resetEmbedderForTests,
  setEmbedderForTests,
} from '../embedder.js';
import { hybridSearch } from '../hybridSearch.js';
import {
  resetRerankRequesterForTests,
  setRerankRequesterForTests,
} from '../rerank.js';
import {
  RerankQuotaError,
  RerankResponseError,
  RerankUnavailableError,
} from '../rerankErrors.js';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from '../retrievalErrors.js';
import { searchWithRerank } from '../searchWithRerank.js';
import {
  ensureTestDatabase,
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from './testDatabase.js';

loadEnvFiles();
const previousDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = resolvePgTestDatabaseUrl();
const voyageKey = process.env.VOYAGE_API_KEY?.trim() ?? '';

function axisVector(axis: number, weight = 1): number[] {
  const vector = new Array<number>(EMBED_DIM).fill(0);
  vector[axis] = weight;
  return vector;
}

async function seedReadyDocument(options: {
  ownerUsername: string;
  knowledgeBaseId: string;
  filename: string;
  chunks: Array<{
    content: string;
    embedding: number[];
    embeddingModel: string;
  }>;
}): Promise<string> {
  const documentId = crypto.randomUUID();
  await insert({
    id: documentId,
    knowledgeBaseId: options.knowledgeBaseId,
    ownerUsername: options.ownerUsername,
    filename: options.filename,
    mimeType: 'text/plain',
    sizeBytes: 1,
    storagePath: `${options.ownerUsername}/${documentId}.txt`,
    contentHash: sha256Hex(Buffer.from(documentId)),
    status: 'pending',
    progress: 0,
    error: null,
    sourceRelativePath: null,
  });
  await replaceForDocument({
    ownerUsername: options.ownerUsername,
    documentId,
    knowledgeBaseId: options.knowledgeBaseId,
    embeddingModel: options.chunks[0]!.embeddingModel,
    embeddingModelVersion: 'test',
    chunks: options.chunks.map((chunk, index) => ({
      content: chunk.content,
      metadata: { filename: options.filename, file_type: 'txt' },
      embedding: chunk.embedding,
      chunkIndex: index,
      embeddingModel: chunk.embeddingModel,
    })),
  });
  return documentId;
}

describe('searchWithRerank query guards', () => {
  afterEach(() => {
    resetEmbedderForTests();
    resetRerankRequesterForTests();
  });

  it('returns [] for empty query without calling rerank', async () => {
    let rerankCalled = false;
    setRerankRequesterForTests(async () => {
      rerankCalled = true;
      return [];
    });
    setEmbedderForTests(async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
    await expect(
      searchWithRerank({
        ownerUsername: 'demo',
        knowledgeBaseId: crypto.randomUUID(),
        query: '   ',
      }),
    ).resolves.toEqual([]);
    expect(rerankCalled).toBe(false);
  });

  it('returns [] when rerankTopN is not positive', async () => {
    let embedCalled = false;
    setEmbedderForTests(async (texts) => {
      embedCalled = true;
      return texts.map((text) => createDeterministicEmbedding(text));
    });
    await expect(
      searchWithRerank({
        ownerUsername: 'demo',
        knowledgeBaseId: crypto.randomUUID(),
        query: '赏花',
        rerankTopN: 0,
      }),
    ).resolves.toEqual([]);
    expect(embedCalled).toBe(false);
  });

  it('throws RetrievalQueryError from hybrid', async () => {
    setEmbedderForTests(async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
    await expect(
      searchWithRerank({
        ownerUsername: 'demo',
        knowledgeBaseId: 'bad',
        query: '赏花',
      }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);
  });
});

describe.skipIf(!testDatabaseUrl)('searchWithRerank with PostgreSQL', () => {
  const previousVoyageKey = process.env.VOYAGE_API_KEY;

  beforeAll(async () => {
    if (!isSafeTestDatabaseUrl(testDatabaseUrl)) {
      throw new Error('Refusing to run PG tests against a non-test database');
    }
    await ensureTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    await initPg();
  });

  afterAll(async () => {
    await resetPoolForTests();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    if (previousVoyageKey === undefined) {
      delete process.env.VOYAGE_API_KEY;
    } else {
      process.env.VOYAGE_API_KEY = previousVoyageKey;
    }
  });

  beforeEach(async () => {
    if (!isSafeTestDatabaseUrl(process.env.DATABASE_URL ?? '')) {
      throw new Error('Refusing to TRUNCATE a non-test database');
    }
    await getPool().query(
      'TRUNCATE document_chunks, documents, knowledge_bases CASCADE',
    );
    setEmbedderForTests(async () => [axisVector(0)]);
    resetRerankRequesterForTests();
  });

  afterEach(() => {
    resetEmbedderForTests();
    resetRerankRequesterForTests();
  });

  async function seedFlowerAndDog(kbId: string): Promise<void> {
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kbId,
      filename: 'mix.txt',
      chunks: [
        {
          content: '公园里的金毛犬在草地上奔跑',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
        {
          content: '春季赏花攻略，樱花与油菜花',
          embedding: axisVector(1),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
  }

  it('keeps RRF order when Voyage is not configured', async () => {
    delete process.env.VOYAGE_API_KEY;
    const kb = await createKnowledgeBase('demo', '无key库');
    await seedFlowerAndDog(kb.id);
    const hybrid = await hybridSearch({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    const reranked = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    expect(reranked.map((hit) => hit.id)).toEqual(
      hybrid.slice(0, reranked.length).map((hit) => hit.id),
    );
    expect(reranked).toHaveLength(Math.min(RERANK_TOP_N, hybrid.length));
    expect(reranked.every((hit) => hit.reranked === false)).toBe(true);
    expect(reranked.every((hit) => hit.relevanceScore === null)).toBe(true);
  });

  it('reorders so the highest injected score is first', async () => {
    process.env.VOYAGE_API_KEY = 'test-voyage-key';
    const kb = await createKnowledgeBase('demo', '精排库');
    await seedFlowerAndDog(kb.id);
    setRerankRequesterForTests(async (input) => {
      const flowerIndex = input.documents.findIndex((text) =>
        text.includes('赏花'),
      );
      return input.documents.map((_, index) => ({
        index,
        relevanceScore: index === flowerIndex ? 0.99 : 0.01,
      }));
    });
    const hits = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    expect(hits[0]?.content).toContain('赏花');
    expect(hits[0]?.reranked).toBe(true);
    expect(hits[0]?.relevanceScore).toBe(0.99);
    expect(hits[1]?.relevanceScore).toBe(0.01);
  });

  it('fail-opens to RRF order when Voyage is unavailable', async () => {
    process.env.VOYAGE_API_KEY = 'test-voyage-key';
    const kb = await createKnowledgeBase('demo', '降级库');
    await seedFlowerAndDog(kb.id);
    const hybrid = await hybridSearch({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    setRerankRequesterForTests(async () => {
      throw new RerankUnavailableError();
    });
    const hits = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    expect(hits.map((hit) => hit.id)).toEqual(
      hybrid.slice(0, hits.length).map((hit) => hit.id),
    );
    expect(hits.every((hit) => hit.reranked === false)).toBe(true);
  });

  it.each([
    ['quota', new RerankQuotaError()],
    ['response', new RerankResponseError('bad payload')],
  ])('fail-opens to RRF order on %s errors', async (_label, error) => {
    process.env.VOYAGE_API_KEY = 'test-voyage-key';
    const kb = await createKnowledgeBase('demo', `fail-open-${_label}`);
    await seedFlowerAndDog(kb.id);
    const hybrid = await hybridSearch({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    setRerankRequesterForTests(async () => {
      throw error;
    });
    const hits = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
    });
    expect(hits.map((hit) => hit.id)).toEqual(
      hybrid.slice(0, hits.length).map((hit) => hit.id),
    );
    expect(hits.every((hit) => hit.reranked === false)).toBe(true);
  });

  it('truncates hybrid candidates to RERANK_TOP_N', async () => {
    process.env.VOYAGE_API_KEY = 'test-voyage-key';
    const kb = await createKnowledgeBase('demo', '截断库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'many.txt',
      chunks: Array.from({ length: 12 }, (_, index) => ({
        content: `keyword chunk ${index} unique-${index}`,
        embedding: axisVector(index % 8),
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      })),
    });
    setRerankRequesterForTests(async (input) =>
      input.documents.map((_, index) => ({
        index,
        relevanceScore: 1 - index * 0.01,
      })),
    );
    const hybrid = await hybridSearch({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: 'keyword',
    });
    expect(hybrid.length).toBeGreaterThan(RERANK_TOP_N);
    const hits = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: 'keyword',
    });
    expect(hits).toHaveLength(RERANK_TOP_N);
    expect(hits.every((hit) => hit.reranked === true)).toBe(true);
  });

  it('caps unreranked results at RERANK_TOP_N when Voyage is not configured', async () => {
    delete process.env.VOYAGE_API_KEY;
    const kb = await createKnowledgeBase('demo', '无key截断库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'many.txt',
      chunks: Array.from({ length: 12 }, (_, index) => ({
        content: `keyword chunk ${index} unique-${index}`,
        embedding: axisVector(index % 8),
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      })),
    });
    const hybrid = await hybridSearch({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: 'keyword',
    });
    expect(hybrid.length).toBeGreaterThan(RERANK_TOP_N);
    const hits = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: 'keyword',
    });
    expect(hits).toHaveLength(RERANK_TOP_N);
    expect(hits.map((hit) => hit.id)).toEqual(
      hybrid.slice(0, RERANK_TOP_N).map((hit) => hit.id),
    );
    expect(hits.every((hit) => hit.reranked === false)).toBe(true);
  });

  it('does not call Voyage for a single hit', async () => {
    process.env.VOYAGE_API_KEY = 'test-voyage-key';
    let rerankCalled = false;
    setRerankRequesterForTests(async () => {
      rerankCalled = true;
      return [{ index: 0, relevanceScore: 1 }];
    });
    const kb = await createKnowledgeBase('demo', '单条库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'one.txt',
      chunks: [
        {
          content: '春季赏花攻略',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    const hits = await searchWithRerank({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.reranked).toBe(false);
    expect(rerankCalled).toBe(false);
  });

  it('propagates RetrievalUnavailableError from hybrid', async () => {
    await resetPoolForTests();
    process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/not_a_real_test';
    try {
      await expect(
        searchWithRerank({
          ownerUsername: 'demo',
          knowledgeBaseId: crypto.randomUUID(),
          query: '赏花',
        }),
      ).rejects.toBeInstanceOf(RetrievalUnavailableError);
    } finally {
      await resetPoolForTests();
      process.env.DATABASE_URL = testDatabaseUrl;
      await initPg();
    }
  }, 10_000);
});

describe.skipIf(!testDatabaseUrl || !voyageKey)(
  'searchWithRerank live Voyage',
  () => {
    beforeAll(async () => {
      if (!isSafeTestDatabaseUrl(testDatabaseUrl)) {
        throw new Error('Refusing to run PG tests against a non-test database');
      }
      await ensureTestDatabase(testDatabaseUrl);
      process.env.DATABASE_URL = testDatabaseUrl;
      await initPg();
    });

    afterAll(async () => {
      await resetPoolForTests();
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    });

    beforeEach(async () => {
      resetEmbedderForTests();
      resetRerankRequesterForTests();
      if (!isSafeTestDatabaseUrl(process.env.DATABASE_URL ?? '')) {
        throw new Error('Refusing to TRUNCATE a non-test database');
      }
      await getPool().query(
        'TRUNCATE document_chunks, documents, knowledge_bases CASCADE',
      );
    });

    it('ranks the flower chunk first for 公园赏花', async () => {
      const kb = await createKnowledgeBase('demo', 'live-rerank');
      const flower = '春季赏花攻略，樱花与油菜花';
      const database = '数据库索引与查询优化';
      await seedReadyDocument({
        ownerUsername: 'demo',
        knowledgeBaseId: kb.id,
        filename: 'zh.txt',
        chunks: [
          {
            content: database,
            embedding: axisVector(0),
            embeddingModel: DEFAULT_EMBEDDING_MODEL,
          },
          {
            content: flower,
            embedding: axisVector(1),
            embeddingModel: DEFAULT_EMBEDDING_MODEL,
          },
        ],
      });
      setEmbedderForTests(async () => [axisVector(0)]);
      const hits = await searchWithRerank({
        ownerUsername: 'demo',
        knowledgeBaseId: kb.id,
        query: '公园赏花',
        vectorK: 2,
        keywordK: 2,
      });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.content).toContain('赏花');
      expect(hits[0]?.reranked).toBe(true);
    }, 60_000);
  },
);
