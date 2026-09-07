import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getOrCreateDefaultForOwner } from './knowledgeBaseStore.js';
import {
  insertFromMigration,
  type PgDocumentStatus,
} from './pgDocumentStore.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SQLITE_PATH = path.resolve(__dirname, '../../.data/chat.db');

interface SqliteDocumentRow {
  id: string;
  owner_username: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  status: string;
  progress: number;
  error: string | null;
  created_at: number;
  source_relative_path: string | null;
}

const ALLOWED_STATUS = new Set<PgDocumentStatus>([
  'uploading',
  'pending',
  'processing',
  'ready',
  'failed',
]);

function toPgStatus(raw: string): PgDocumentStatus {
  if (ALLOWED_STATUS.has(raw as PgDocumentStatus)) {
    return raw as PgDocumentStatus;
  }
  return 'ready';
}

/**
 * 将 SQLite `documents` 迁入 PostgreSQL。
 * 按 owner 复用「默认资料库」；已存在的 document id 跳过（幂等，可重试）。
 */
export async function migrateDocumentsFromSqlite(
  sqlitePath = DEFAULT_SQLITE_PATH,
): Promise<{ skipped: boolean; owners: number; documents: number }> {
  if (!fs.existsSync(sqlitePath)) {
    logger.info('Skip SQLite→PG document migration (no SQLite file)', {
      sqlitePath, // SQLite文件路径
    });
    return { skipped: true, owners: 0, documents: 0 }; // 返回跳过SQLite→PG文档迁移（没有SQLite文件）
  }

  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const table = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'`,
      ) // 查询SQLite数据库中的documents表
      .get() as { name: string } | undefined;
    if (!table) {
      logger.info('Skip SQLite→PG document migration (no documents table)'); // 跳过SQLite→PG文档迁移（没有documents表）
      return { skipped: true, owners: 0, documents: 0 }; // 返回跳过SQLite→PG文档迁移（没有documents表）
    }

    const owners = db
      .prepare(
        `SELECT DISTINCT owner_username AS ownerUsername FROM documents`,
      )
      .all() as Array<{ ownerUsername: string }>; // 查询SQLite数据库中的documents表中的owner_username列

    const kbByOwner = new Map<string, string>(); // 创建一个Map，用于存储ownerUsername和knowledgeBaseId的映射
    for (const { ownerUsername } of owners) {
      const kb = await getOrCreateDefaultForOwner(ownerUsername); // 获取或创建默认知识库
      kbByOwner.set(ownerUsername, kb.id); // 将ownerUsername和knowledgeBaseId的映射存储到Map中
    }

    const rows = db
      .prepare(`SELECT * FROM documents ORDER BY created_at ASC`) // 查询SQLite数据库中的documents表
      .all() as SqliteDocumentRow[]; // 查询SQLite数据库中的documents表

    let inserted = 0; // 插入的文档数量
    for (const row of rows) {
      const knowledgeBaseId = kbByOwner.get(row.owner_username);
      if (!knowledgeBaseId) {
        continue;
      }
      const result = await insertFromMigration({
        id: row.id,
        knowledgeBaseId,
        ownerUsername: row.owner_username,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        storagePath: row.storage_path,
        status: toPgStatus(row.status),
        progress: row.progress,
        error: row.error,
        createdAt: new Date(row.created_at),
        sourceRelativePath: row.source_relative_path,
      }); // 插入文档
      if (result) {
        inserted += 1; // 插入的文档数量加1
      }
    }

    logger.info('Migrated SQLite documents to PostgreSQL', {
      owners: owners.length,
      documents: inserted,
    });
    return {
      skipped: false,
      owners: owners.length,
      documents: inserted,
    };
  } finally {
    db.close();
  }
}
