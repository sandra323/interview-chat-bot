import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Same default DB file as ChatStore — auth_sessions lives alongside chat tables. */
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../.data/chat.db');

export interface AuthSessionRow {
  id: string;
  username: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface CreateSessionResult {
  /** Opaque bearer token — returned once; never stored in plaintext. */
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
   * Issue a new session. Stores only sha256(token).
   * @param ttlHours absolute TTL from `now` (usually AUTH_SESSION_TTL_HOURS)
   * @param now optional clock for tests
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

  /** Valid = not revoked and not past expires_at. */
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

  /** Any session row for this token (including expired / revoked). */
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

  /** Valid session by primary key (for WS re-checks without raw token). */
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
   * Mark session revoked. Idempotent: already-revoked / missing → false.
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

  /** Delete rows that are past expires_at. Returns deleted count. */
  purgeExpired(now: number = Date.now()): number {
    const result = this.db
      .prepare(`DELETE FROM auth_sessions WHERE expires_at <= ?`)
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
