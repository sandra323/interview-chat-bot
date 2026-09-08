import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../../config/env.js';
import { sha256Hex } from '../contentHash.js';
import { DEFAULT_EMBEDDING_MODEL, EMBED_DIM } from '../chunkConfig.js';
import {
  createDeterministicEmbedding,
  embeddingModelInfo,
  resetEmbedderForTests,
  setEmbedderForTests,
} from '../embedder.js';
import { createKnowledgeBase } from '../knowledgeBaseStore.js';
import { insert } from '../pgDocumentStore.js';
import { getPool, initPg, resetPoolForTests } from '../pg.js';
import { replaceForDocument } from '../chunkStore.js';
import { searchByKeyword } from '../keywordSearch.js';
import { searchByVector } from '../vectorSearch.js';
import {
  ensureTestDatabase,
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from './testDatabase.js';

loadEnvFiles();
const previousDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = resolvePgTestDatabaseUrl();

function axisVector(): number[] {
  return createDeterministicEmbedding('pgvector-query', EMBED_DIM);
}

async function seedChunk(options: {
  ownerUsername: string;
  knowledgeBaseId: string;
  filename: string;
  content: string;
  embeddingModel: string;
  embedding: number[];
}): Promise<void> {
  const documentId = crypto.randomUUID();
  await insert({
    id: documentId,
    knowledgeBaseId: options.knowledgeBaseId,
    ownerUsername: options.ownerUsername,
    filename: options.filename,
    mimeType: 'text/plain',
    sizeBytes: options.content.length,
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
    embeddingModel: options.embeddingModel,
    embeddingModelVersion: 'gap',
    chunks: [
      {
        content: options.content,
        metadata: { filename: options.filename, file_type: 'txt' },
        embedding: options.embedding,
        chunkIndex: 0,
        embeddingModel: options.embeddingModel,
      },
    ],
  });
}

describe.skipIf(!testDatabaseUrl)('retrieval gap fixtures', () => {
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
    setEmbedderForTests(async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
  });

  afterEach(() => {
    resetEmbedderForTests();
  });

  it('hides an old embedding model from vector search but not keyword search', async () => {
    const kb = await createKnowledgeBase('alice', '模型过滤');
    const current = embeddingModelInfo().model || DEFAULT_EMBEDDING_MODEL;
    const vector = axisVector();
    await seedChunk({
      ownerUsername: 'alice',
      knowledgeBaseId: kb.id,
      filename: 'old.txt',
      content: '旧模型里的金毛犬护理记录',
      embeddingModel: 'text-embedding-ada-002',
      embedding: vector,
    });
    await seedChunk({
      ownerUsername: 'alice',
      knowledgeBaseId: kb.id,
      filename: 'new.txt',
      content: '当前模型里的金毛犬护理记录',
      embeddingModel: current,
      embedding: vector,
    });

    const vectorHits = await searchByVector({
      ownerUsername: 'alice',
      knowledgeBaseId: kb.id,
      query: 'pgvector-query',
    });
    expect(vectorHits.every((hit) => hit.embeddingModel === current)).toBe(true);
    expect(vectorHits.some((hit) => hit.content.includes('旧模型'))).toBe(false);

    const keywordHits = await searchByKeyword({
      ownerUsername: 'alice',
      knowledgeBaseId: kb.id,
      query: '金毛犬护理',
    });
    expect(keywordHits.some((hit) => hit.content.includes('旧模型'))).toBe(true);
  });

  it('does not return another knowledge base for an English proper-noun query', async () => {
    const mine = await createKnowledgeBase('alice', '专名库');
    const other = await createKnowledgeBase('alice', '其它库');
    const vector = axisVector();
    await seedChunk({
      ownerUsername: 'alice',
      knowledgeBaseId: mine.id,
      filename: 'vue.txt',
      content: '前端使用 Vue3 Composition API 管理状态',
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      embedding: vector,
    });
    await seedChunk({
      ownerUsername: 'alice',
      knowledgeBaseId: other.id,
      filename: 'noise.txt',
      content: '数据库索引与事务隔离说明',
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      embedding: vector,
    });

    const hits = await searchByKeyword({
      ownerUsername: 'alice',
      knowledgeBaseId: mine.id,
      query: 'Vue3 Composition API',
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.knowledgeBaseId === mine.id)).toBe(true);
    expect(hits.some((hit) => hit.content.includes('索引'))).toBe(false);
  });
});
