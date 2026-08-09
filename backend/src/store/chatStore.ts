import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { ChatMessage, ReplyEndReason } from '@ai-chat/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../.data/chat.db');

export type GenerationStatus =
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface GenerationRecord {
  id: string;
  conversationId: string;
  status: GenerationStatus;
  contentBuffer: string;
  error: string | null;
  updatedAt: number;
}

export class ChatStore {
  private db: Database.Database;

  constructor(dbPath = DEFAULT_DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS generations (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'error')),
        content_buffer TEXT NOT NULL DEFAULT '',
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_generations_conversation
        ON generations(conversation_id, updated_at);
    `);
  }

  close(): void {
    this.db.close();
  }

  createConversation(id?: string): string {
    const conversationId = id ?? crypto.randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)`,
      )
      .run(conversationId, now, now);
    return conversationId;
  }

  conversationExists(id: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 AS ok FROM conversations WHERE id = ?`)
      .get(id) as { ok: number } | undefined;
    return Boolean(row);
  }

  ensureConversation(id?: string): string {
    if (id && this.conversationExists(id)) {
      return id;
    }
    return this.createConversation(id ?? crypto.randomUUID());
  }

  touchConversation(conversationId: string): void {
    this.db
      .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
      .run(Date.now(), conversationId);
  }

  appendMessage(
    conversationId: string,
    role: ChatMessage['role'],
    content: string,
    id?: string,
  ): string {
    const messageId = id ?? crypto.randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(messageId, conversationId, role, content, now);
    this.touchConversation(conversationId);
    return messageId;
  }

  listChatMessages(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT role, content FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
      )
      .all(conversationId) as Array<{ role: ChatMessage['role']; content: string }>;
    return rows.map((row) => ({ role: row.role, content: row.content }));
  }

  createGeneration(conversationId: string, generationId: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO generations
          (id, conversation_id, status, content_buffer, error, created_at, updated_at)
         VALUES (?, ?, 'running', '', NULL, ?, ?)`,
      )
      .run(generationId, conversationId, now, now);
    this.touchConversation(conversationId);
  }

  getGeneration(generationId: string): GenerationRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, conversation_id, status, content_buffer, error, updated_at
         FROM generations WHERE id = ?`,
      )
      .get(generationId) as
      | {
          id: string;
          conversation_id: string;
          status: GenerationStatus;
          content_buffer: string;
          error: string | null;
          updated_at: number;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      contentBuffer: row.content_buffer,
      error: row.error,
      updatedAt: row.updated_at,
    };
  }

  getRunningGeneration(conversationId: string): GenerationRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, conversation_id, status, content_buffer, error, updated_at
         FROM generations
         WHERE conversation_id = ? AND status = 'running'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(conversationId) as
      | {
          id: string;
          conversation_id: string;
          status: GenerationStatus;
          content_buffer: string;
          error: string | null;
          updated_at: number;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      contentBuffer: row.content_buffer,
      error: row.error,
      updatedAt: row.updated_at,
    };
  }

  /** Append delta; returns offset before append and new full buffer. */
  appendGenerationContent(
    generationId: string,
    delta: string,
  ): { offset: number; content: string } | null {
    const current = this.getGeneration(generationId);
    if (!current || current.status !== 'running') return null;
    const offset = current.contentBuffer.length;
    const content = current.contentBuffer + delta;
    this.db
      .prepare(
        `UPDATE generations
         SET content_buffer = ?, updated_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .run(content, Date.now(), generationId);
    return { offset, content };
  }

  finalizeGeneration(
    generationId: string,
    status: Exclude<GenerationStatus, 'running'>,
    options?: { error?: string; persistAssistant?: boolean },
  ): GenerationRecord | null {
    const current = this.getGeneration(generationId);
    if (!current) return null;
    if (current.status !== 'running') return current;

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE generations
         SET status = ?, error = ?, updated_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .run(status, options?.error ?? null, now, generationId);

    const persistAssistant = options?.persistAssistant !== false;
    if (
      persistAssistant &&
      (status === 'completed' || status === 'cancelled') &&
      current.contentBuffer.trim()
    ) {
      this.appendMessage(
        current.conversationId,
        'assistant',
        current.contentBuffer,
        generationId,
      );
    }

    return this.getGeneration(generationId);
  }

  deleteConversation(conversationId: string): void {
    this.db
      .prepare(`DELETE FROM conversations WHERE id = ?`)
      .run(conversationId);
  }

  /** After process restart, in-memory jobs are gone — fail open running rows. */
  failOrphanedRunningGenerations(): number {
    const result = this.db
      .prepare(
        `UPDATE generations
         SET status = 'error',
             error = '服务已重启，请重新发送',
             updated_at = ?
         WHERE status = 'running'`,
      )
      .run(Date.now());
    return result.changes;
  }
}

let singleton: ChatStore | null = null;

export function getChatStore(): ChatStore {
  if (!singleton) {
    singleton = new ChatStore();
  }
  return singleton;
}

export function resetChatStoreForTests(dbPath?: string): ChatStore {
  if (singleton) {
    singleton.close();
  }
  singleton = new ChatStore(dbPath);
  return singleton;
}

export type { ReplyEndReason };
