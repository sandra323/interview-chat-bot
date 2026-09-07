import { INGEST_PROGRESS, resolveVectorTopK } from './chunkConfig.js';
import type { ChunkDraft } from './chunker.js';
import { PersistError } from './ingestErrors.js';
import { getPool } from './pg.js';
import { assertFiniteVector, formatVector } from './pgvectorFormat.js';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from './retrievalErrors.js';
import type { VectorHit } from './retrievalTypes.js';

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
      await client.query(
        `INSERT INTO document_chunks (
           document_id, knowledge_base_id, owner_username, content,
           embedding, fts_tokens, chunk_index, metadata, embedding_model
         ) VALUES (
           $1, $2, $3, $4,
           $5::vector, '', $6, $7::jsonb, $8
         )`,
        [
          input.documentId,
          input.knowledgeBaseId,
          input.ownerUsername,
          chunk.content,
          formatVector(chunk.embedding),
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

interface VectorSearchDbRow {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  owner_username: string;
  content: string;
  chunk_index: number;
  metadata: unknown;
  embedding_model: string | null;
  distance: string | number;
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

function mapVectorHit(row: VectorSearchDbRow): VectorHit {
  return {
    id: row.id,
    documentId: row.document_id,
    knowledgeBaseId: row.knowledge_base_id,
    ownerUsername: row.owner_username,
    content: row.content,
    chunkIndex: row.chunk_index,
    metadata: asMetadata(row.metadata),
    embeddingModel: row.embedding_model,
    distance: Number(row.distance),
  };
}

function asMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
