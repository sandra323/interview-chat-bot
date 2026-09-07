import { INGEST_PROGRESS } from './chunkConfig.js';
import type { ChunkDraft } from './chunker.js';
import { PersistError } from './ingestErrors.js';
import { getPool } from './pg.js';

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

function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
