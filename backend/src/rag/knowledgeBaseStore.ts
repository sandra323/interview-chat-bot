import { getPool } from './pg.js';
import { DEFAULT_KNOWLEDGE_BASE_NAME } from '@ai-chat/shared';

export interface KnowledgeBaseRow {
  id: string;
  ownerUsername: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

interface KnowledgeBaseDbRow {
  id: string;
  owner_username: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: KnowledgeBaseDbRow): KnowledgeBaseRow {
  return {
    id: row.id,
    ownerUsername: row.owner_username,
    name: row.name,
    description: row.description ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createKnowledgeBase(
  ownerUsername: string,
  name: string,
  description = '',
): Promise<KnowledgeBaseRow> {
  const result = await getPool().query<KnowledgeBaseDbRow>(
    `INSERT INTO knowledge_bases (owner_username, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, owner_username, name, description, created_at, updated_at`, // 返回知识库ID、用户名、名称、描述、创建时间、更新时间
    [ownerUsername, name, description],
  ); // 插入知识库
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create knowledge base'); // 如果插入失败，则抛出错误
  }
  return mapRow(row); // 映射知识库
}

export async function listByOwner(
  ownerUsername: string,
): Promise<KnowledgeBaseRow[]> {
  const result = await getPool().query<KnowledgeBaseDbRow>(
    `SELECT id, owner_username, name, description, created_at, updated_at
     FROM knowledge_bases
     WHERE owner_username = $1
     ORDER BY updated_at DESC`, // 按更新时间排序
    [ownerUsername],
  );
  return result.rows.map(mapRow); // 映射知识库
}

export async function getByIdForOwner(
  id: string,
  ownerUsername: string,
): Promise<KnowledgeBaseRow | null> {
  const result = await getPool().query<KnowledgeBaseDbRow>(
    `SELECT id, owner_username, name, description, created_at, updated_at
     FROM knowledge_bases
     WHERE id = $1 AND owner_username = $2
     LIMIT 1`, // 按ID和用户名查询
    [id, ownerUsername],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function findByNameForOwner(
  ownerUsername: string,
  name: string,
): Promise<KnowledgeBaseRow | null> {
  const result = await getPool().query<KnowledgeBaseDbRow>(
    `SELECT id, owner_username, name, description, created_at, updated_at
     FROM knowledge_bases
     WHERE owner_username = $1 AND name = $2
     ORDER BY created_at ASC
     LIMIT 1`, // 按用户名和名称查询
    [ownerUsername, name],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function getOrCreateDefaultForOwner(
  ownerUsername: string,
): Promise<KnowledgeBaseRow> {
  const existing = await findByNameForOwner(
    ownerUsername,
    DEFAULT_KNOWLEDGE_BASE_NAME,
  );
  if (existing) {
    return existing; // 如果知识库已存在，则返回已存在的知识库
  }
  return createKnowledgeBase(ownerUsername, DEFAULT_KNOWLEDGE_BASE_NAME); // 如果知识库不存在，则创建知识库
}

export async function updateForOwner(
  id: string,
  ownerUsername: string,
  patch: { name?: string; description?: string },
): Promise<KnowledgeBaseRow | null> {
  const result = await getPool().query<KnowledgeBaseDbRow>(
    `UPDATE knowledge_bases
     SET name = COALESCE($3, name),
         description = COALESCE($4, description),
         updated_at = now()
     WHERE id = $1 AND owner_username = $2
     RETURNING id, owner_username, name, description, created_at, updated_at`, // 返回知识库ID、用户名、名称、描述、创建时间、更新时间
    [id, ownerUsername, patch.name ?? null, patch.description ?? null], // 更新知识库
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function deleteForOwner(
  id: string,
  ownerUsername: string,
): Promise<boolean> {
  const result = await getPool().query(
    `DELETE FROM knowledge_bases
     WHERE id = $1 AND owner_username = $2`, // 按ID和用户名删除
    [id, ownerUsername],
  );
  return (result.rowCount ?? 0) > 0;
}

/** 迁移用：统计全部知识库数量（幂等判断）。 */
export async function countAllKnowledgeBases(): Promise<number> {
  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM knowledge_bases`,
  );
  return Number(result.rows[0]?.total ?? 0);
}
