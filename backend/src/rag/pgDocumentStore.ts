import type { KnowledgeDocument, KnowledgeDocumentPage } from '@ai-chat/shared';
import { DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';
import { getPool } from './pg.js';

export type PgDocumentStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

export interface PgDocumentRow {
  id: string;
  knowledgeBaseId: string;
  ownerUsername: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  contentHash: string | null;
  status: PgDocumentStatus;
  progress: number;
  error: string | null;
  embeddingModel: string | null;
  embeddingModelVersion: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
  sourceRelativePath: string | null;
}

export interface InsertDocumentInput {
  id: string;
  knowledgeBaseId: string;
  ownerUsername: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  contentHash: string;
  status: PgDocumentStatus;
  progress: number;
  error: string | null;
  sourceRelativePath: string | null;
}

export interface InsertFromMigrationInput {
  id: string;
  knowledgeBaseId: string;
  ownerUsername: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  status: PgDocumentStatus;
  progress: number;
  error: string | null;
  createdAt: Date;
  sourceRelativePath: string | null;
}

interface DocumentDbRow {
  id: string;
  knowledge_base_id: string;
  owner_username: string;
  filename: string;
  mime_type: string;
  size_bytes: string | number;
  storage_path: string;
  content_hash: string | null;
  status: PgDocumentStatus;
  progress: number;
  error: string | null;
  embedding_model: string | null;
  embedding_model_version: string | null;
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
  source_relative_path: string | null;
}

function mapRow(row: DocumentDbRow): PgDocumentRow {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    ownerUsername: row.owner_username,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    storagePath: row.storage_path,
    contentHash: row.content_hash,
    status: row.status,
    progress: row.progress,
    error: row.error,
    embeddingModel: row.embedding_model,
    embeddingModelVersion: row.embedding_model_version,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceRelativePath: row.source_relative_path,
  };
}

function escapeLike(raw: string): string {
  return raw.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

export function toPublicDocument(row: PgDocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    progress: row.progress,
    error: row.error,
    createdAt: row.createdAt.getTime(),
    sourceRelativePath: row.sourceRelativePath,
  };
}

async function listPage(
  whereSql: string,
  params: Array<string | number>,
  options?: { q?: string; page?: number; pageSize?: number },
): Promise<KnowledgeDocumentPage> {
  const pageRaw = options?.page ?? 1;
  const sizeRaw = options?.pageSize ?? DOCUMENT_PAGE_SIZE;
  const safePage =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const safeSize =
    Number.isFinite(sizeRaw) && sizeRaw >= 1
      ? Math.min(Math.floor(sizeRaw), 100)
      : DOCUMENT_PAGE_SIZE;
  const offset = (safePage - 1) * safeSize;

  const q = options?.q?.trim() ?? '';
  const whereParts = [whereSql];
  const queryParams: Array<string | number> = [...params];

  if (q) {
    queryParams.push(`%${escapeLike(q)}%`);
    whereParts.push(
      `filename ILIKE $${queryParams.length} ESCAPE '!'`,
    );
  }

  const where = whereParts.join(' AND ');

  const totalResult = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM documents WHERE ${where}`,
    queryParams,
  );
  const total = Number(totalResult.rows[0]?.total ?? 0);

  const limitPlaceholder = queryParams.length + 1;
  const offsetPlaceholder = queryParams.length + 2;
  const rows = await getPool().query<DocumentDbRow>(
    `SELECT * FROM documents
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
    [...queryParams, safeSize, offset],
  );

  return {
    items: rows.rows.map((row) => toPublicDocument(mapRow(row))),
    page: safePage,
    pageSize: safeSize,
    total,
    hasMore: offset + rows.rows.length < total,
  };
}

export async function insert(
  input: InsertDocumentInput,
): Promise<PgDocumentRow> {
  const result = await getPool().query<DocumentDbRow>(
    `INSERT INTO documents (
       id, knowledge_base_id, owner_username, filename, mime_type, size_bytes,
       storage_path, content_hash, status, progress, error,
       source_relative_path
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12
     )
     RETURNING *`,
    [
      input.id,
      input.knowledgeBaseId,
      input.ownerUsername,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.storagePath,
      input.contentHash,
      input.status,
      input.progress,
      input.error,
      input.sourceRelativePath,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to insert document');
  }
  return mapRow(row);
}

/** SQLite → PG 迁移写入；同 id 已存在则跳过。 */
export async function insertFromMigration(
  input: InsertFromMigrationInput,
): Promise<PgDocumentRow | null> {
  const result = await getPool().query<DocumentDbRow>(
    `INSERT INTO documents (
       id, knowledge_base_id, owner_username, filename, mime_type, size_bytes,
       storage_path, status, progress, error, created_at, updated_at,
       source_relative_path
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $11,
       $12
     )
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      input.id,
      input.knowledgeBaseId,
      input.ownerUsername,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.storagePath,
      input.status,
      input.progress,
      input.error,
      input.createdAt,
      input.sourceRelativePath,
    ],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function getByIdForOwner(
  id: string,
  ownerUsername: string,
): Promise<PgDocumentRow | null> {
  const result = await getPool().query<DocumentDbRow>(
    `SELECT * FROM documents
     WHERE id = $1 AND owner_username = $2
     LIMIT 1`,
    [id, ownerUsername],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function listPageForOwner(
  ownerUsername: string,
  options?: { q?: string; page?: number; pageSize?: number },
): Promise<KnowledgeDocumentPage> {
  return listPage('owner_username = $1', [ownerUsername], options);
}

export async function listPageForKnowledgeBase(
  ownerUsername: string,
  knowledgeBaseId: string,
  options?: { q?: string; page?: number; pageSize?: number },
): Promise<KnowledgeDocumentPage> {
  return listPage(
    'owner_username = $1 AND knowledge_base_id = $2',
    [ownerUsername, knowledgeBaseId],
    options,
  );
}

export async function updateStatus(
  id: string,
  ownerUsername: string,
  patch: {
    status: PgDocumentStatus;
    progress: number;
    error: string | null;
    embeddingModel?: string | null;
    embeddingModelVersion?: string | null;
    chunkCount?: number;
  },
): Promise<PgDocumentRow | null> {
  const result = await getPool().query<DocumentDbRow>(
    `UPDATE documents
     SET status = $3,
         progress = $4,
         error = $5,
         updated_at = now(),
         embedding_model = COALESCE($6, embedding_model),
         embedding_model_version = COALESCE($7, embedding_model_version),
         chunk_count = COALESCE($8, chunk_count)
     WHERE id = $1 AND owner_username = $2
     RETURNING *`,
    [
      id,
      ownerUsername,
      patch.status,
      patch.progress,
      patch.error,
      patch.embeddingModel ?? null,
      patch.embeddingModelVersion ?? null,
      patch.chunkCount ?? null,
    ],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function findByFilenameInKnowledgeBase(
  ownerUsername: string,
  knowledgeBaseId: string,
  filename: string,
): Promise<PgDocumentRow | null> {
  const result = await getPool().query<DocumentDbRow>(
    `SELECT * FROM documents
     WHERE owner_username = $1
       AND knowledge_base_id = $2
       AND lower(filename) = lower($3)
     ORDER BY created_at ASC
     LIMIT 1`,
    [ownerUsername, knowledgeBaseId, filename],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function findByHashInKnowledgeBase(
  ownerUsername: string,
  knowledgeBaseId: string,
  contentHash: string,
): Promise<PgDocumentRow | null> {
  const result = await getPool().query<DocumentDbRow>(
    `SELECT * FROM documents
     WHERE owner_username = $1
       AND knowledge_base_id = $2
       AND content_hash = $3
     ORDER BY created_at ASC
     LIMIT 1`,
    [ownerUsername, knowledgeBaseId, contentHash],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function deleteByIdForOwner(
  id: string,
  ownerUsername: string,
): Promise<PgDocumentRow | null> {
  const existing = await getByIdForOwner(id, ownerUsername);
  if (!existing) {
    return null;
  }
  await getPool().query(
    `DELETE FROM documents WHERE id = $1 AND owner_username = $2`,
    [id, ownerUsername],
  );
  return existing;
}

export async function listStoragePathsForKnowledgeBase(
  knowledgeBaseId: string,
  ownerUsername: string,
): Promise<string[]> {
  const result = await getPool().query<{ storage_path: string }>(
    `SELECT storage_path FROM documents
     WHERE knowledge_base_id = $1 AND owner_username = $2`,
    [knowledgeBaseId, ownerUsername],
  );
  return result.rows.map((row) => row.storage_path);
}

export async function failStaleProcessing(
  maxAgeMs = 15 * 60 * 1000,
): Promise<number> {
  const result = await getPool().query(
    `UPDATE documents
     SET status = 'failed',
         error = $1,
         updated_at = now()
     WHERE status = 'processing'
       AND updated_at < now() - ($2::int * INTERVAL '1 millisecond')`,
    ['哎呀，文件处理超时了，请稍后重试', maxAgeMs],
  );
  return result.rowCount ?? 0;
}

export async function listIncompleteForIngest(): Promise<
  Array<{ id: string; ownerUsername: string; filename: string }>
> {
  const result = await getPool().query<{
    id: string;
    owner_username: string;
    filename: string;
  }>(
    `SELECT id, owner_username, filename
     FROM documents
     WHERE status IN ('uploading', 'pending', 'processing')
        OR (
          status = 'ready'
          AND (chunk_count = 0 OR embedding_model IS NULL)
        )
     ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    ownerUsername: row.owner_username,
    filename: row.filename,
  }));
}

/** @deprecated 使用 listIncompleteForIngest */
export const listIncompleteForParse = listIncompleteForIngest;
