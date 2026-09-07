import {
  FTS_BACKFILL_BATCH,
  INGEST_PROGRESS,
  resolveKeywordTopK,
  resolveVectorTopK,
} from './chunkConfig.js';
import type { ChunkDraft } from './chunker.js';
import { PersistError } from './ingestErrors.js';
import { tokenizeForFts } from './jiebaFts.js';
import { getPool } from './pg.js';
import { assertFiniteVector, formatVector } from './pgvectorFormat.js';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from './retrievalErrors.js';
import type { ChunkHit, KeywordHit, VectorHit } from './retrievalTypes.js';
import { logger } from '../utils/logger.js';

export interface ChunkToInsert extends ChunkDraft {
  embedding: number[];
  chunkIndex: number;
  embeddingModel: string;
}

export interface ReplaceChunksInput {
  ownerUsername: string;
  documentId: string;
  knowledgeBaseId: string;
  embeddingModel: string;
  embeddingModelVersion: string;
  chunks: ChunkToInsert[];
}

/**
 * embed 成功后调用：同一事务删除旧 chunk、插入新 chunk，并把文档标为 ready。
 * 文档已被删除时返回 false，不插入孤儿行。
 * fts_tokens 在此边界分词；分词失败写空串，不阻断 ready。
 */
export async function replaceForDocument(
  input: ReplaceChunksInput,
): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query(
      `SELECT id FROM documents
       WHERE id = $1 AND owner_username = $2
       FOR UPDATE`,
      [input.documentId, input.ownerUsername],
    );
    if (!owned.rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `DELETE FROM document_chunks
       WHERE document_id = $1 AND owner_username = $2`,
      [input.documentId, input.ownerUsername],
    );

    for (const chunk of input.chunks) {
      const ftsTokens = tokenizeForFts(chunk.content);
      await client.query(
        `INSERT INTO document_chunks (
           document_id, knowledge_base_id, owner_username, content,
           embedding, fts_tokens, chunk_index, metadata, embedding_model
         ) VALUES (
           $1, $2, $3, $4,
           $5::vector, $6, $7, $8::jsonb, $9
         )`,
        [
          input.documentId,
          input.knowledgeBaseId,
          input.ownerUsername,
          chunk.content,
          formatVector(chunk.embedding),
          ftsTokens,
          chunk.chunkIndex,
          JSON.stringify(chunk.metadata),
          chunk.embeddingModel,
        ],
      );
    }

    await client.query(
      `UPDATE documents
       SET status = 'ready',
           progress = $3,
           error = NULL,
           embedding_model = $4,
           embedding_model_version = $5,
           chunk_count = $6,
           updated_at = now()
       WHERE id = $1 AND owner_username = $2`,
      [
        input.documentId,
        input.ownerUsername,
        INGEST_PROGRESS.ready,
        input.embeddingModel,
        input.embeddingModelVersion,
        input.chunks.length,
      ],
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 忽略
    }
    throw new PersistError(error);
  } finally {
    client.release();
  }
}

/**
 * 把存量空 fts_tokens 按 content 回填，不重 embed。
 * 按 id 游标分页，单行失败 skip；整体异常只打 warn，不阻断启动。
 */
export async function backfillEmptyFtsTokens(): Promise<number> {
  let updated = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';
  try {
    for (;;) {
      const result = await getPool().query<{ id: string; content: string }>(
        `SELECT id, content
         FROM document_chunks
         WHERE fts_tokens = '' AND content <> '' AND id > $1
         ORDER BY id
         LIMIT $2`,
        [lastId, FTS_BACKFILL_BATCH],
      );
      if (result.rows.length === 0) {
        break;
      }
      for (const row of result.rows) {
        lastId = row.id;
        try {
          const tokens = tokenizeForFts(row.content);
          if (!tokens) {
            continue;
          }
          await getPool().query(
            `UPDATE document_chunks SET fts_tokens = $2 WHERE id = $1`,
            [row.id, tokens],
          );
          updated += 1;
        } catch (error) {
          logger.warn('fts backfill skipped', {
            chunkId: row.id,
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      }
    }
    if (updated > 0) {
      logger.info('fts tokens backfilled', { updated });
    }
  } catch (error) {
    logger.warn('fts backfill aborted', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
  return updated;
}

export async function countForDocument(
  ownerUsername: string,
  documentId: string,
): Promise<number> {
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM document_chunks
     WHERE document_id = $1 AND owner_username = $2`,
    [documentId, ownerUsername],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function listChunkIdsForDocument(
  ownerUsername: string,
  documentId: string,
): Promise<string[]> {
  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM document_chunks
     WHERE document_id = $1 AND owner_username = $2
     ORDER BY chunk_index ASC`,
    [documentId, ownerUsername],
  );
  return result.rows.map((row) => row.id);
}

export interface SearchVectorInput {
  ownerUsername: string;
  knowledgeBaseId: string;
  embedding: number[];
  k?: number;
  embeddingModel: string;
}

export interface SearchKeywordInput {
  ownerUsername: string;
  knowledgeBaseId: string;
  tokens: string;
  k?: number;
}

interface ChunkSearchDbRow {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  owner_username: string;
  content: string;
  chunk_index: number;
  metadata: unknown;
  embedding_model: string | null;
}

interface VectorSearchDbRow extends ChunkSearchDbRow {
  distance: string | number;
}

interface KeywordSearchDbRow extends ChunkSearchDbRow {
  rank: string | number;
}

function asMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function mapChunkHit(row: ChunkSearchDbRow): ChunkHit {
  return {
    id: row.id,
    documentId: row.document_id,
    knowledgeBaseId: row.knowledge_base_id,
    ownerUsername: row.owner_username,
    content: row.content,
    chunkIndex: row.chunk_index,
    metadata: asMetadata(row.metadata),
    embeddingModel: row.embedding_model,
  };
}

function mapVectorHit(row: VectorSearchDbRow): VectorHit {
  return {
    ...mapChunkHit(row),
    distance: Number(row.distance),
  };
}

function mapKeywordHit(row: KeywordSearchDbRow): KeywordHit {
  return {
    ...mapChunkHit(row),
    tsRank: Number(row.rank),
  };
}

/**
 * 余弦距离粗召，无相似度硬阈值。
 * 必须同时约束 owner + knowledge_base_id；只搜 ready 文档上、当前模型、非空向量。
 */
export async function searchVector(
  input: SearchVectorInput,
): Promise<VectorHit[]> {
  const limit = resolveVectorTopK(input.k);
  if (limit <= 0) {
    return [];
  }
  try {
    assertFiniteVector(input.embedding);
  } catch (error) {
    throw new RetrievalQueryError(
      error instanceof Error ? error.message : 'invalid embedding',
    );
  }

  try {
    const result = await getPool().query<VectorSearchDbRow>(
      `SELECT
         c.id,
         c.document_id,
         c.knowledge_base_id,
         c.owner_username,
         c.content,
         c.chunk_index,
         c.metadata,
         c.embedding_model,
         (c.embedding <=> $3::vector) AS distance
       FROM document_chunks c
       INNER JOIN documents d
         ON d.id = c.document_id
        AND d.owner_username = c.owner_username
        AND d.knowledge_base_id = c.knowledge_base_id
       WHERE c.owner_username = $1
         AND c.knowledge_base_id = $2
         AND d.status = 'ready'
         AND c.embedding IS NOT NULL
         AND c.embedding_model = $4
       ORDER BY c.embedding <=> $3::vector
       LIMIT $5`,
      [
        input.ownerUsername,
        input.knowledgeBaseId,
        formatVector(input.embedding),
        input.embeddingModel,
        limit,
      ],
    );
    return result.rows.map(mapVectorHit);
  } catch (error) {
    if (
      error instanceof RetrievalQueryError ||
      error instanceof RetrievalUnavailableError
    ) {
      throw error;
    }
    throw new RetrievalUnavailableError(error);
  }
}

/**
 * jieba 空格分隔 lexeme 的 FTS 粗召，不按 embedding_model 过滤。
 * 必须同时约束 owner + knowledge_base_id；只搜 ready 文档。tokens 为空返回 []。
 */
export async function searchKeyword(
  input: SearchKeywordInput,
): Promise<KeywordHit[]> {
  const limit = resolveKeywordTopK(input.k);
  if (limit <= 0 || !input.tokens.trim()) {
    return [];
  }

  try {
    const result = await getPool().query<KeywordSearchDbRow>(
      `SELECT
         c.id,
         c.document_id,
         c.knowledge_base_id,
         c.owner_username,
         c.content,
         c.chunk_index,
         c.metadata,
         c.embedding_model,
         ts_rank(c.search_tsv, q.query) AS rank
       FROM document_chunks c
       INNER JOIN documents d
         ON d.id = c.document_id
        AND d.owner_username = c.owner_username
        AND d.knowledge_base_id = c.knowledge_base_id
       CROSS JOIN plainto_tsquery('simple', $3) AS q(query)
       WHERE c.owner_username = $1
         AND c.knowledge_base_id = $2
         AND d.status = 'ready'
         AND q.query <> ''::tsquery
         AND c.search_tsv @@ q.query
       ORDER BY ts_rank(c.search_tsv, q.query) DESC, c.chunk_index ASC
       LIMIT $4`,
      [input.ownerUsername, input.knowledgeBaseId, input.tokens, limit],
    );
    return result.rows.map(mapKeywordHit);
  } catch (error) {
    if (
      error instanceof RetrievalQueryError ||
      error instanceof RetrievalUnavailableError
    ) {
      throw error;
    }
    throw new RetrievalUnavailableError(error);
  }
}
