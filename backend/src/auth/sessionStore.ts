import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 与 ChatStore 相同的默认 DB 文件——auth_sessions 与 chat 表共存。 */
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../.data/chat.db');

export interface AuthSessionRow {
  id: string;
  username: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface CreateSessionResult {
  /** 不透明 Bearer token——仅返回一次；数据库中从不存明文。 */
  token: string;
  id: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export class AuthSessionStore {
  private db: Database.Database;

  constructor(dbPath = DEFAULT_DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
        ON auth_sessions(token_hash);

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
        ON auth_sessions(expires_at);
    `);
  }

  close(): void {
    this.db.close();
  }

  /**
   * 签发新会话。数据库中仅存储 sha256(token)。
   * @param ttlHours 从 `now` 起的绝对 TTL（通常为 AUTH_SESSION_TTL_HOURS）
   * @param now 可选时钟，供测试使用
   */
  createSession(
    username: string,
    ttlHours: number,
    now: number = Date.now(),
  ): CreateSessionResult {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      throw new Error('username is required');
    }
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      throw new Error('ttlHours must be a positive number');
    }

    this.purgeExpired(now);

    const id = crypto.randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const createdAt = now;
    const expiresAt = now + Math.round(ttlHours * 60 * 60 * 1000);

    this.db
      .prepare(
        `INSERT INTO auth_sessions
          (id, token_hash, username, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, tokenHash, normalizedUsername, createdAt, expiresAt);

    return {
      token,
      id,
      username: normalizedUsername,
      createdAt,
      expiresAt,
    };
  }

  /** 有效 = 未撤销且未超过 expires_at。 */
  findValidByToken(
    rawToken: string,
    now: number = Date.now(),
  ): AuthSessionRow | null {
    if (!rawToken) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT id, username, created_at AS createdAt, expires_at AS expiresAt,
                revoked_at AS revokedAt
         FROM auth_sessions
         WHERE token_hash = ?
           AND revoked_at IS NULL
           AND expires_at > ?`,
      )
      .get(hashToken(rawToken), now) as
      | {
          id: string;
          username: string;
          createdAt: number;
          expiresAt: number;
          revokedAt: number | null;
        }
      | undefined;

    return row ?? null;
  }

  /** 该 token 对应的任意会话行（含已过期 / 已撤销）。 */
  lookupByToken(rawToken: string): AuthSessionRow | null {
    if (!rawToken) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT id, username, created_at AS createdAt, expires_at AS expiresAt,
                revoked_at AS revokedAt
         FROM auth_sessions
         WHERE token_hash = ?`,
      )
      .get(hashToken(rawToken)) as
      | {
          id: string;
          username: string;
          createdAt: number;
          expiresAt: number;
          revokedAt: number | null;
        }
      | undefined;

    return row ?? null;
  }

  /** 按主键查找有效会话（WebSocket 复查时无需原始 token）。 */
  findValidById(
    sessionId: string,
    now: number = Date.now(),
  ): AuthSessionRow | null {
    if (!sessionId) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT id, username, created_at AS createdAt, expires_at AS expiresAt,
                revoked_at AS revokedAt
         FROM auth_sessions
         WHERE id = ?
           AND revoked_at IS NULL
           AND expires_at > ?`,
      )
      .get(sessionId, now) as
      | {
          id: string;
          username: string;
          createdAt: number;
          expiresAt: number;
          revokedAt: number | null;
        }
      | undefined;

    return row ?? null;
  }

  /**
   * 标记会话已撤销。幂等：已撤销 / 不存在 → 返回 false。
   */
  revokeByToken(rawToken: string, now: number = Date.now()): boolean {
    if (!rawToken) {
      return false;
    }
    const result = this.db
      .prepare(
        `UPDATE auth_sessions
         SET revoked_at = ?
         WHERE token_hash = ?
           AND revoked_at IS NULL`,
      )
      .run(now, hashToken(rawToken));
    return result.changes > 0;
  }

  /**
   * 撤销某用户名的所有活跃会话。
   * @param exceptSessionId 若设置则保留该会话（例如刚创建的那条）
   * @returns 被撤销的行数
   */
  revokeAllForUsername(
    username: string,
    now: number = Date.now(),
    exceptSessionId?: string,
  ): number {
    const normalized = username.trim();
    if (!normalized) {
      return 0;
    }
    if (exceptSessionId) {
      const result = this.db
        .prepare(
          `UPDATE auth_sessions
           SET revoked_at = ?
           WHERE username = ?
             AND revoked_at IS NULL
             AND id != ?`,
        )
        .run(now, normalized, exceptSessionId);
      return result.changes;
    }
    const result = this.db
      .prepare(
        `UPDATE auth_sessions
         SET revoked_at = ?
         WHERE username = ?
           AND revoked_at IS NULL`,
      )
      .run(now, normalized);
    return result.changes;
  }

  /**
   * 删除已过期行和已撤销行（认证不再需要）。
   * 返回删除的行数。
   */
  purgeExpired(now: number = Date.now()): number {
    const result = this.db
      .prepare(
        `DELETE FROM auth_sessions
         WHERE expires_at <= ?
            OR revoked_at IS NOT NULL`,
      )
      .run(now);
    return result.changes;
  }
}

let singleton: AuthSessionStore | null = null;

export function getAuthSessionStore(): AuthSessionStore {
  if (!singleton) {
    singleton = new AuthSessionStore();
  }
  return singleton;
}

export function resetAuthSessionStoreForTests(dbPath?: string): AuthSessionStore {
  if (singleton) {
    singleton.close();
  }
  singleton = new AuthSessionStore(dbPath);
  return singleton;
}
