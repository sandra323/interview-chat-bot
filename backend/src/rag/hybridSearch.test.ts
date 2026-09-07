import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../config/env.js';
import { sha256Hex } from './contentHash.js';
import { DEFAULT_EMBEDDING_MODEL, EMBED_DIM } from './chunkConfig.js';
import { createKnowledgeBase } from './knowledgeBaseStore.js';
import { insert } from './pgDocumentStore.js';
import { getPool, initPg, resetPoolForTests } from './pg.js';
import { replaceForDocument } from './chunkStore.js';
import {
  createDeterministicEmbedding,
  resetEmbedderForTests,
  setEmbedderForTests,
} from './embedder.js';
import { hybridSearch } from './hybridSearch.js';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from './retrievalErrors.js';
import {
  ensureTestDatabase,
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from './testDatabase.js';

loadEnvFiles();
const previousDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = resolvePgTestDatabaseUrl();

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

describe('hybridSearch query guards', () => {
  afterEach(() => {
    resetEmbedderForTests();
  });

  it('returns [] for empty query without embedding', async () => {
    let embedCalled = false;
    setEmbedderForTests(async (texts) => {
      embedCalled = true;
      return texts.map((text) => createDeterministicEmbedding(text));
    });
    await expect(
      hybridSearch({
        ownerUsername: 'demo',
        knowledgeBaseId: crypto.randomUUID(),
        query: '   ',
      }),
    ).resolves.toEqual([]);
    expect(embedCalled).toBe(false);
  });

  it('throws RetrievalQueryError before searching', async () => {
    setEmbedderForTests(async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
    await expect(
      hybridSearch({
        ownerUsername: 'demo',
        knowledgeBaseId: 'bad',
        query: '赏花',
      }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);
  });
});

describe.skipIf(!testDatabaseUrl)('hybrid search with PostgreSQL', () => {
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
    if (!isSafeTestDatabaseUrl(process.env.DATABASE_URL ?? '')) {
      throw new Error('Refusing to TRUNCATE a non-test database');
    }
    await getPool().query(
      'TRUNCATE document_chunks, documents, knowledge_bases CASCADE',
    );
    setEmbedderForTests(async () => [axisVector(0)]);
  });

  afterEach(() => {
    resetEmbedderForTests();
  });

  it('fuses a vector-only hit with a keyword-only hit', async () => {
    const kb = await createKnowledgeBase('demo', '融合库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
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
        {
          content: '数据库索引与查询优化',
          embedding: axisVector(2),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });

    const hits = await hybridSearch({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
      vectorK: 1,
      keywordK: 20,
      fusionTopN: 12,
    });
    const contents = hits.map((hit) => hit.content);
    expect(contents).toEqual(
      expect.arrayContaining([
        '公园里的金毛犬在草地上奔跑',
        '春季赏花攻略，樱花与油菜花',
      ]),
    );
    const dog = hits.find((hit) => hit.content.includes('金毛犬'));
    const flower = hits.find((hit) => hit.content.includes('赏花'));
    expect(dog?.fromVector).toBe(true);
    expect(dog?.fromKeyword).toBe(false);
    expect(flower?.fromKeyword).toBe(true);
  });

  it('still returns FTS hits when embedding is not configured', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetEmbedderForTests();
    const kb = await createKnowledgeBase('demo', '降级库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'flower.txt',
      chunks: [
        {
          content: '春季赏花攻略，樱花与油菜花',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    try {
      const hits = await hybridSearch({
        ownerUsername: 'demo',
        knowledgeBaseId: kb.id,
        query: '赏花',
      });
      expect(hits.some((hit) => hit.content.includes('赏花'))).toBe(true);
      expect(hits.every((hit) => hit.fromKeyword)).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = prev;
      }
    }
  });

  it('throws RetrievalUnavailableError when both paths cannot reach Postgres', async () => {
    await resetPoolForTests();
    process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/not_a_real_test';
    try {
      await expect(
        hybridSearch({
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
