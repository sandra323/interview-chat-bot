import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../../config/env.js';
import { sha256Hex } from '../contentHash.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  EMBED_DIM,
  EMBED_MAX_INPUT_CHARS,
  VECTOR_TOP_K,
} from '../chunkConfig.js';
import { createKnowledgeBase } from '../knowledgeBaseStore.js';
import { insert, updateStatus } from '../pgDocumentStore.js';
import { getPool, initPg, resetPoolForTests } from '../pg.js';
import { replaceForDocument, searchVector } from '../chunkStore.js';
import {
  createDeterministicEmbedding,
  createDeterministicEmbeddings,
  resetEmbedderForTests,
  setEmbedderForTests,
  embedTexts,
  embeddingModelInfo,
} from '../embedder.js';
import { EmbedConfigError } from '../ingestErrors.js';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from '../retrievalErrors.js';
import {
  ensureTestDatabase,
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from './testDatabase.js';
import {
  assertKnowledgeBaseId,
  normalizeQueryForEmbed,
  searchByVector,
} from '../vectorSearch.js';

loadEnvFiles();
const previousDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = resolvePgTestDatabaseUrl();
const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? '';

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

describe('vectorSearch query guards', () => {
  afterEach(() => {
    resetEmbedderForTests();
  });

  it('trims and truncates overlong queries', () => {
    expect(normalizeQueryForEmbed('  hello  ')).toBe('hello');
    expect(normalizeQueryForEmbed('   ')).toBe('');
    const long = '汉'.repeat(EMBED_MAX_INPUT_CHARS + 10);
    expect(normalizeQueryForEmbed(long)).toHaveLength(EMBED_MAX_INPUT_CHARS);
  });

  it('rejects a non-UUID knowledgeBaseId', () => {
    expect(() => assertKnowledgeBaseId('not-a-uuid')).toThrow(
      RetrievalQueryError,
    );
  });

  it('returns [] for empty query or k<=0 without embedding', async () => {
    const kbId = crypto.randomUUID();
    let embedCalled = false;
    setEmbedderForTests(async (texts) => {
      embedCalled = true;
      return texts.map((text) => createDeterministicEmbedding(text));
    });
    await expect(
      searchByVector({
        ownerUsername: 'demo',
        knowledgeBaseId: kbId,
        query: '   ',
      }),
    ).resolves.toEqual([]);
    await expect(
      searchByVector({
        ownerUsername: 'demo',
        knowledgeBaseId: kbId,
        query: '小狗狗',
        k: 0,
      }),
    ).resolves.toEqual([]);
    expect(embedCalled).toBe(false);
  });

  it('throws RetrievalQueryError for a malformed knowledgeBaseId', async () => {
    setEmbedderForTests(async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
    await expect(
      searchByVector({
        ownerUsername: 'demo',
        knowledgeBaseId: 'bad',
        query: 'hello',
      }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);
  });

  it('surfaces EmbedConfigError when the API key is missing', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetEmbedderForTests();
    try {
      await expect(
        searchByVector({
          ownerUsername: 'demo',
          knowledgeBaseId: crypto.randomUUID(),
          query: 'hello',
        }),
      ).rejects.toBeInstanceOf(EmbedConfigError);
    } finally {
      if (prev === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = prev;
      }
    }
  });

  it('rejects a non-finite query embedding before touching Postgres', async () => {
    await expect(
      searchVector({
        ownerUsername: 'demo',
        knowledgeBaseId: crypto.randomUUID(),
        embedding: [Number.NaN, 0],
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);
  });
});

describe.skipIf(!testDatabaseUrl)('vector search with PostgreSQL', () => {
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
    setEmbedderForTests(async (texts) => createDeterministicEmbeddings(texts));
  });

  afterEach(() => {
    resetEmbedderForTests();
  });

  it('ranks the nearest synthetic vector first without a score threshold', async () => {
    const kb = await createKnowledgeBase('demo', '合成库');
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

    const query = axisVector(0, 0.9);
    query[1] = 0.1;
    const hits = await searchVector({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      embedding: query,
      k: VECTOR_TOP_K,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    expect(hits).toHaveLength(3);
    expect(hits[0]?.content).toContain('金毛犬');
    expect(hits.map((hit) => hit.content)).toEqual(
      expect.arrayContaining(['春季赏花攻略，樱花与油菜花', '数据库索引与查询优化']),
    );
    expect(hits[0]!.distance).toBeLessThan(hits[1]!.distance);
  });

  it('does not leak chunks across owners or knowledge bases', async () => {
    const aliceKb = await createKnowledgeBase('alice', 'alice-kb');
    const bobKb = await createKnowledgeBase('bob', 'bob-kb');
    const aliceOther = await createKnowledgeBase('alice', 'alice-other');
    const vector = axisVector(0);
    await seedReadyDocument({
      ownerUsername: 'alice',
      knowledgeBaseId: aliceKb.id,
      filename: 'secret.txt',
      chunks: [
        {
          content: 'alice secret',
          embedding: vector,
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    await seedReadyDocument({
      ownerUsername: 'bob',
      knowledgeBaseId: bobKb.id,
      filename: 'bob.txt',
      chunks: [
        {
          content: 'bob secret',
          embedding: vector,
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });

    const asBob = await searchVector({
      ownerUsername: 'bob',
      knowledgeBaseId: aliceKb.id,
      embedding: vector,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    expect(asBob).toEqual([]);

    const wrongKb = await searchVector({
      ownerUsername: 'alice',
      knowledgeBaseId: aliceOther.id,
      embedding: vector,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    expect(wrongKb).toEqual([]);

    const aliceHits = await searchVector({
      ownerUsername: 'alice',
      knowledgeBaseId: aliceKb.id,
      embedding: vector,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    expect(aliceHits).toHaveLength(1);
    expect(aliceHits[0]?.content).toBe('alice secret');
  });

  it('skips NULL embeddings, processing documents, and other embedding models', async () => {
    const kb = await createKnowledgeBase('demo', '过滤库');
    const readyId = await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'ready.txt',
      chunks: [
        {
          content: 'visible ready chunk',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
        {
          content: 'null embedding chunk',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    await getPool().query(
      `UPDATE document_chunks
       SET embedding = NULL
       WHERE document_id = $1 AND content = $2`,
      [readyId, 'null embedding chunk'],
    );

    const processingId = await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'processing.txt',
      chunks: [
        {
          content: 'should be hidden while processing',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    await updateStatus(processingId, 'demo', {
      status: 'processing',
      progress: 50,
      error: null,
    });

    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'old-model.txt',
      chunks: [
        {
          content: 'old embedding model',
          embedding: axisVector(0),
          embeddingModel: 'text-embedding-ada-002',
        },
      ],
    });

    const hits = await searchVector({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      embedding: axisVector(0),
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toBe('visible ready chunk');
  });

  it('returns all candidates when k is larger than the corpus', async () => {
    const kb = await createKnowledgeBase('demo', '少条库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'two.txt',
      chunks: [
        {
          content: 'one',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
        {
          content: 'two',
          embedding: axisVector(1),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    const hits = await searchVector({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      embedding: axisVector(0),
      k: 50,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    expect(hits).toHaveLength(2);
  });

  it('searchByVector embeds the query and returns matching chunks', async () => {
    const kb = await createKnowledgeBase('demo', '编排库');
    const content = 'deterministic match text';
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'match.txt',
      chunks: [
        {
          content,
          embedding: createDeterministicEmbedding(content),
          embeddingModel: embeddingModelInfo().model,
        },
      ],
    });
    const hits = await searchByVector({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: content,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toBe(content);
    expect(hits[0]?.distance).toBeGreaterThanOrEqual(0);
  });

  it('wraps Postgres failures as RetrievalUnavailableError', async () => {
    await resetPoolForTests();
    process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/not_a_real_test';
    try {
      await expect(
        searchVector({
          ownerUsername: 'demo',
          knowledgeBaseId: crypto.randomUUID(),
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        }),
      ).rejects.toBeInstanceOf(RetrievalUnavailableError);
    } finally {
      await resetPoolForTests();
      process.env.DATABASE_URL = testDatabaseUrl;
      await initPg();
    }
  }, 10_000);
});

describe.skipIf(!testDatabaseUrl || !openaiKey)(
  'vector search live OpenAI (小狗狗)',
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
      if (!isSafeTestDatabaseUrl(process.env.DATABASE_URL ?? '')) {
        throw new Error('Refusing to TRUNCATE a non-test database');
      }
      await getPool().query(
        'TRUNCATE document_chunks, documents, knowledge_bases CASCADE',
      );
    });

    it('returns the dog-related chunk for query 小狗狗 in Top-K', async () => {
      const kb = await createKnowledgeBase('demo', '小狗狗夹具');
      const dog = '公园里的金毛犬在草地上奔跑、追逐飞盘';
      const flower = '春季赏花攻略，樱花与油菜花';
      const database = '数据库索引与查询优化';
      const vectors = await embedTexts([dog, flower, database]);
      const model = embeddingModelInfo().model;
      await seedReadyDocument({
        ownerUsername: 'demo',
        knowledgeBaseId: kb.id,
        filename: 'zh.txt',
        chunks: [
          { content: dog, embedding: vectors[0]!, embeddingModel: model },
          { content: flower, embedding: vectors[1]!, embeddingModel: model },
          { content: database, embedding: vectors[2]!, embeddingModel: model },
        ],
      });

      const hits = await searchByVector({
        ownerUsername: 'demo',
        knowledgeBaseId: kb.id,
        query: '小狗狗',
      });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.map((hit) => hit.content)).toContain(dog);
    }, 60_000);
  },
);
