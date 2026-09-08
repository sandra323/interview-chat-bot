import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DEFAULT_KNOWLEDGE_BASE_NAME } from '@ai-chat/shared';
import {
  findByNameForOwner,
  getOrCreateDefaultForOwner,
} from './knowledgeBaseStore.js';
import {
  getByIdForOwner,
  insertFromMigration,
  type PgDocumentStatus,
} from './pgDocumentStore.js';
import {
  isLegacySqliteDocumentHandled,
  markLegacySqliteDocumentHandled,
} from './sqliteMigrationLog.js';
import { getFileStorage } from '../documents/fileStorage.js';
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
 * 仅在有待迁入行时复用/创建「默认资料库」；已迁入的 id 跳过（幂等，可重试）。
 */
async function resolveDefaultKnowledgeBaseId(
  ownerUsername: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const cached = cache.get(ownerUsername);
  if (cached) {
    return cached;
  }
  const existing = await findByNameForOwner(
    ownerUsername,
    DEFAULT_KNOWLEDGE_BASE_NAME,
  );
  if (!existing) {
    return null;
  }
  cache.set(ownerUsername, existing.id);
  return existing.id;
}

async function ensureDefaultKnowledgeBaseId(
  ownerUsername: string,
  cache: Map<string, string>,
): Promise<string> {
  const resolved = await resolveDefaultKnowledgeBaseId(ownerUsername, cache);
  if (resolved) {
    return resolved;
  }
  const kb = await getOrCreateDefaultForOwner(ownerUsername);
  cache.set(ownerUsername, kb.id);
  return kb.id;
}

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

    const rows = db
      .prepare(`SELECT * FROM documents ORDER BY created_at ASC`)
      .all() as SqliteDocumentRow[];

    const kbByOwner = new Map<string, string>();
    let inserted = 0;
    const touchedOwners = new Set<string>();
    for (const row of rows) {
      if (await isLegacySqliteDocumentHandled(row.id)) {
        continue;
      }

      const alreadyInPg = await getByIdForOwner(row.id, row.owner_username);
      if (alreadyInPg) {
        await markLegacySqliteDocumentHandled(row.id, row.owner_username);
        continue;
      }

      if (!getFileStorage().exists(row.storage_path)) {
        await markLegacySqliteDocumentHandled(row.id, row.owner_username);
        continue;
      }

      touchedOwners.add(row.owner_username);
      const knowledgeBaseId = await ensureDefaultKnowledgeBaseId(
        row.owner_username,
        kbByOwner,
      );
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
        inserted += 1;
        await markLegacySqliteDocumentHandled(row.id, row.owner_username);
      }
    }

    logger.info('Migrated SQLite documents to PostgreSQL', {
      owners: touchedOwners.size,
      documents: inserted,
    });
    return {
      skipped: false,
      owners: touchedOwners.size,
      documents: inserted,
    };
  } finally {
    db.close();
  }
}
