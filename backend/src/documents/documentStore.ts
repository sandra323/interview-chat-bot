import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type {
  DocumentStatus,
  KnowledgeDocument,
  KnowledgeDocumentPage,
} from '@ai-chat/shared';
import { DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../.data/chat.db');

interface DocumentRow {
  id: string;
  owner_username: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  status: DocumentStatus;
  progress: number;
  error: string | null;
  created_at: number;
  source_relative_path: string | null;
}

export interface InsertDocumentInput {
  id: string;
  ownerUsername: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  status: DocumentStatus;
  progress: number;
  error: string | null;
  createdAt: number;
  sourceRelativePath: string | null;
}

export interface StoredDocument extends KnowledgeDocument {
  ownerUsername: string;
  storagePath: string;
}

function escapeLike(raw: string): string {
  return raw.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function mapPublic(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    progress: row.progress,
    error: row.error,
    createdAt: row.created_at,
    sourceRelativePath: row.source_relative_path,
  };
}

function mapStored(row: DocumentRow): StoredDocument {
  return {
    ...mapPublic(row),
    ownerUsername: row.owner_username,
    storagePath: row.storage_path,
  };
}

export class DocumentStore {
  private db: Database.Database;

  constructor(dbPath = DEFAULT_DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        owner_username TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'failed')),
        progress INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        source_relative_path TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_documents_owner_created
        ON documents(owner_username, created_at DESC);
    `);
  }

  close(): void {
    this.db.close();
  }

  insert(input: InsertDocumentInput): KnowledgeDocument {
    this.db
      .prepare(
        `INSERT INTO documents (
          id, owner_username, filename, mime_type, size_bytes, storage_path,
          status, progress, error, created_at, source_relative_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
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
      );

    return {
      id: input.id,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: input.status,
      progress: input.progress,
      error: input.error,
      createdAt: input.createdAt,
      sourceRelativePath: input.sourceRelativePath,
    };
  }

  getByIdForOwner(id: string, ownerUsername: string): StoredDocument | null {
    const row = this.db
      .prepare(
        `SELECT * FROM documents WHERE id = ? AND owner_username = ?`,
      )
      .get(id, ownerUsername) as DocumentRow | undefined;
    return row ? mapStored(row) : null;
  }

  listPage(
    ownerUsername: string,
    options?: { q?: string; page?: number; pageSize?: number },
  ): KnowledgeDocumentPage {
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
    const whereParts = ['owner_username = ?'];
    const params: Array<string | number> = [ownerUsername];

    if (q) {
      whereParts.push(`filename LIKE ? ESCAPE '!' COLLATE NOCASE`);
      params.push(`%${escapeLike(q)}%`);
    }

    const whereSql = whereParts.join(' AND ');

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM documents WHERE ${whereSql}`)
      .get(...params) as { total: number };
    const total = totalRow?.total ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM documents
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, safeSize, offset) as DocumentRow[];

    return {
      items: rows.map(mapPublic),
      page: safePage,
      pageSize: safeSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  deleteByIdForOwner(id: string, ownerUsername: string): StoredDocument | null {
    const existing = this.getByIdForOwner(id, ownerUsername);
    if (!existing) {
      return null;
    }
    this.db
      .prepare(`DELETE FROM documents WHERE id = ? AND owner_username = ?`)
      .run(id, ownerUsername);
    return existing;
  }
}

let singleton: DocumentStore | null = null;

export function getDocumentStore(): DocumentStore {
  if (!singleton) {
    singleton = new DocumentStore();
  }
  return singleton;
}

export function resetDocumentStoreForTests(dbPath?: string): DocumentStore {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      // 忽略
    }
  }
  singleton = new DocumentStore(dbPath);
  return singleton;
}
