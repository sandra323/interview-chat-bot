import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../config/env.js';
import { sha256Hex } from './contentHash.js';
import { DEFAULT_EMBEDDING_MODEL, EMBED_DIM } from './chunkConfig.js';
import { createKnowledgeBase } from './knowledgeBaseStore.js';
import { insert, updateStatus } from './pgDocumentStore.js';
import { getPool, initPg, resetPoolForTests } from './pg.js';
import {
  backfillEmptyFtsTokens,
  replaceForDocument,
  searchKeyword,
} from './chunkStore.js';
import {
  resetTokenizerForTests,
  setTokenizerForTests,
} from './jiebaFts.js';
import { searchByKeyword } from './keywordSearch.js';
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

describe('keywordSearch query guards', () => {
  afterEach(() => {
    resetTokenizerForTests();
  });

  it('returns [] for empty query, punctuation, or k<=0 without PG', async () => {
    const kbId = crypto.randomUUID();
    await expect(
      searchByKeyword({
        ownerUsername: 'demo',
        knowledgeBaseId: kbId,
        query: '   ',
      }),
    ).resolves.toEqual([]);
    await expect(
      searchByKeyword({
        ownerUsername: 'demo',
        knowledgeBaseId: kbId,
        query: '!!!',
      }),
    ).resolves.toEqual([]);
    await expect(
      searchByKeyword({
        ownerUsername: 'demo',
        knowledgeBaseId: kbId,
        query: '赏花',
        k: 0,
      }),
    ).resolves.toEqual([]);
  });

  it('throws RetrievalQueryError for a malformed knowledgeBaseId', async () => {
    await expect(
      searchByKeyword({
        ownerUsername: 'demo',
        knowledgeBaseId: 'bad',
        query: '赏花',
      }),
    ).rejects.toBeInstanceOf(RetrievalQueryError);
  });
});

describe.skipIf(!testDatabaseUrl)('keyword search with PostgreSQL', () => {
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
  });

  afterEach(() => {
    resetTokenizerForTests();
  });

  it('writes non-empty fts_tokens and hits by literal keyword, not cosine', async () => {
    const kb = await createKnowledgeBase('demo', '关键词库');
    const documentId = await seedReadyDocument({
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
      ],
    });

    const stored = await getPool().query<{ fts_tokens: string }>(
      `SELECT fts_tokens FROM document_chunks
       WHERE document_id = $1 AND content LIKE '%赏花%'`,
      [documentId],
    );
    expect(stored.rows[0]?.fts_tokens.length).toBeGreaterThan(0);

    const hits = await searchByKeyword({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
    });
    expect(hits.map((hit) => hit.content)).toEqual([
      '春季赏花攻略，樱花与油菜花',
    ]);
  });

  it('does not leak chunks across owners or knowledge bases', async () => {
    const aliceKb = await createKnowledgeBase('alice', 'alice-kb');
    const bobKb = await createKnowledgeBase('bob', 'bob-kb');
    const aliceOther = await createKnowledgeBase('alice', 'alice-other');
    await seedReadyDocument({
      ownerUsername: 'alice',
      knowledgeBaseId: aliceKb.id,
      filename: 'secret.txt',
      chunks: [
        {
          content: 'alice secret token',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });

    const asBob = await searchByKeyword({
      ownerUsername: 'bob',
      knowledgeBaseId: aliceKb.id,
      query: 'secret',
    });
    expect(asBob).toEqual([]);

    const wrongKb = await searchByKeyword({
      ownerUsername: 'alice',
      knowledgeBaseId: aliceOther.id,
      query: 'secret',
    });
    expect(wrongKb).toEqual([]);

    const aliceHits = await searchByKeyword({
      ownerUsername: 'alice',
      knowledgeBaseId: aliceKb.id,
      query: 'secret',
    });
    expect(aliceHits).toHaveLength(1);
  });

  it('skips processing documents and empty fts_tokens, but not other embedding models', async () => {
    const kb = await createKnowledgeBase('demo', '过滤库');
    const readyId = await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'ready.txt',
      chunks: [
        {
          content: 'visible ready chunk keyword',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
        {
          content: 'empty tokens keyword',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    await getPool().query(
      `UPDATE document_chunks SET fts_tokens = ''
       WHERE document_id = $1 AND content = $2`,
      [readyId, 'empty tokens keyword'],
    );

    const processingId = await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'processing.txt',
      chunks: [
        {
          content: 'hidden processing keyword',
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
          content: 'old embedding model keyword',
          embedding: axisVector(0),
          embeddingModel: 'text-embedding-ada-002',
        },
      ],
    });

    const hits = await searchByKeyword({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: 'keyword',
    });
    expect(hits.map((hit) => hit.content).sort()).toEqual([
      'old embedding model keyword',
      'visible ready chunk keyword',
    ]);
  });

  it('returns all keyword matches when k is larger than the corpus', async () => {
    const kb = await createKnowledgeBase('demo', '少条库');
    await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'two.txt',
      chunks: [
        {
          content: 'alpha keyword',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
        {
          content: 'beta keyword',
          embedding: axisVector(1),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    const hits = await searchByKeyword({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: 'keyword',
      k: 50,
    });
    expect(hits).toHaveLength(2);
  });

  it('backfills empty fts_tokens without re-embedding', async () => {
    const kb = await createKnowledgeBase('demo', '回填库');
    const documentId = await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'backfill.txt',
      chunks: [
        {
          content: '春季赏花攻略',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    await getPool().query(
      `UPDATE document_chunks SET fts_tokens = '' WHERE document_id = $1`,
      [documentId],
    );
    expect(
      await searchByKeyword({
        ownerUsername: 'demo',
        knowledgeBaseId: kb.id,
        query: '赏花',
      }),
    ).toEqual([]);

    const updated = await backfillEmptyFtsTokens();
    expect(updated).toBeGreaterThanOrEqual(1);
    const hits = await searchByKeyword({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      query: '赏花',
    });
    expect(hits[0]?.content).toBe('春季赏花攻略');
  });

  it('still marks the document ready when tokenize fails', async () => {
    setTokenizerForTests(() => {
      throw new Error('boom');
    });
    const kb = await createKnowledgeBase('demo', '分词失败库');
    const documentId = await seedReadyDocument({
      ownerUsername: 'demo',
      knowledgeBaseId: kb.id,
      filename: 'fail.txt',
      chunks: [
        {
          content: '春季赏花攻略',
          embedding: axisVector(0),
          embeddingModel: DEFAULT_EMBEDDING_MODEL,
        },
      ],
    });
    const stored = await getPool().query<{ fts_tokens: string; status: string }>(
      `SELECT c.fts_tokens, d.status
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.document_id = $1`,
      [documentId],
    );
    expect(stored.rows[0]?.status).toBe('ready');
    expect(stored.rows[0]?.fts_tokens).toBe('');
  });

  it('wraps Postgres failures as RetrievalUnavailableError', async () => {
    await resetPoolForTests();
    process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/not_a_real_test';
    try {
      await expect(
        searchKeyword({
          ownerUsername: 'demo',
          knowledgeBaseId: crypto.randomUUID(),
          tokens: '赏花',
        }),
      ).rejects.toBeInstanceOf(RetrievalUnavailableError);
    } finally {
      await resetPoolForTests();
      process.env.DATABASE_URL = testDatabaseUrl;
      await initPg();
    }
  }, 10_000);
});
