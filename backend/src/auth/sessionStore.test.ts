import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthSessionStore } from './sessionStore.js';

function tokenHashStored(dbPath: string, value: string): boolean {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare(`SELECT 1 AS ok FROM auth_sessions WHERE token_hash = ? LIMIT 1`)
      .get(value) as { ok: number } | undefined;
    return Boolean(row);
  } finally {
    db.close();
  }
}

describe('AuthSessionStore', () => {
  const paths: string[] = [];
  const stores: AuthSessionStore[] = [];

  afterEach(() => {
    for (const store of stores) {
      try {
        store.close();
      } catch {
        // ignore
      }
    }
    stores.length = 0;
    for (const p of paths) {
      try {
        fs.rmSync(p, { force: true });
        fs.rmSync(`${p}-wal`, { force: true });
        fs.rmSync(`${p}-shm`, { force: true });
      } catch {
        // ignore
      }
    }
    paths.length = 0;
  });

  function createStore() {
    const dbPath = path.join(
      os.tmpdir(),
      `auth-session-test-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    const store = new AuthSessionStore(dbPath);
    stores.push(store);
    return { store, dbPath };
  }

  it('createSession then findValidByToken returns username and expiresAt', () => {
    const { store } = createStore();
    const now = 1_700_000_000_000;
    const created = store.createSession('demo', 24, now);

    expect(created.token.length).toBeGreaterThanOrEqual(43);
    expect(created.username).toBe('demo');
    expect(created.expiresAt).toBe(now + 24 * 60 * 60 * 1000);

    const found = store.findValidByToken(created.token, now + 1000);
    expect(found).toEqual({
      id: created.id,
      username: 'demo',
      createdAt: now,
      expiresAt: created.expiresAt,
      revokedAt: null,
    });
  });

  it('trims username before insert', () => {
    const { store } = createStore();
    const created = store.createSession('  demo  ', 24);
    expect(created.username).toBe('demo');
    expect(store.findValidByToken(created.token)?.username).toBe('demo');
  });

  it('does not store the raw token in the database', () => {
    const { store, dbPath } = createStore();
    const created = store.createSession('demo', 24);
    expect(tokenHashStored(dbPath, created.token)).toBe(false);

    const expectedHash = createHash('sha256')
      .update(created.token, 'utf8')
      .digest('hex');
    expect(tokenHashStored(dbPath, expectedHash)).toBe(true);
  });

  it('findValidByToken fails after revoke', () => {
    const { store } = createStore();
    const now = 1_700_000_000_000;
    const created = store.createSession('demo', 24, now);

    expect(store.revokeByToken(created.token, now + 1)).toBe(true);
    expect(store.findValidByToken(created.token, now + 2)).toBeNull();
    // idempotent revoke
    expect(store.revokeByToken(created.token, now + 3)).toBe(false);
  });

  it('findValidByToken fails when session is expired', () => {
    const { store } = createStore();
    const createdAt = 1_700_000_000_000;
    const created = store.createSession('demo', 1, createdAt);
    const afterExpiry = created.expiresAt + 1;

    expect(store.findValidByToken(created.token, afterExpiry)).toBeNull();
  });

  it('purgeExpired removes past-TTL rows', () => {
    const { store, dbPath } = createStore();
    const t0 = 1_700_000_000_000;
    const created = store.createSession('demo', 1, t0);
    const afterExpiry = created.expiresAt + 1;

    expect(store.purgeExpired(afterExpiry)).toBe(1);
    expect(store.findValidByToken(created.token, afterExpiry)).toBeNull();
    expect(
      tokenHashStored(
        dbPath,
        createHash('sha256').update(created.token, 'utf8').digest('hex'),
      ),
    ).toBe(false);
  });

  it('findValidById fails when expired or revoked', () => {
    const { store } = createStore();
    const now = 1_700_000_000_000;
    const created = store.createSession('demo', 1, now);
    expect(store.findValidById(created.id, now + 1000)?.username).toBe('demo');
    expect(store.findValidById(created.id, created.expiresAt + 1)).toBeNull();

    const live = store.createSession('demo', 24, now);
    store.revokeByToken(live.token, now + 1);
    expect(store.findValidById(live.id, now + 2)).toBeNull();
  });

  it('survives reopen on the same sqlite file', () => {
    const dbPath = path.join(
      os.tmpdir(),
      `auth-session-persist-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);

    const first = new AuthSessionStore(dbPath);
    stores.push(first);
    const created = first.createSession('demo', 24, 1_700_000_000_000);
    first.close();
    stores.pop();

    const second = new AuthSessionStore(dbPath);
    stores.push(second);
    const found = second.findValidByToken(created.token, 1_700_000_000_000 + 1);
    expect(found?.username).toBe('demo');
    expect(found?.id).toBe(created.id);
  });
});
