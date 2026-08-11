import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveBearerSession } from './resolveSession.js';
import {
  AuthSessionStore,
  resetAuthSessionStoreForTests,
} from './sessionStore.js';

describe('resolveBearerSession', () => {
  const paths: string[] = [];
  let store: AuthSessionStore;

  afterEach(() => {
    try {
      store.close();
    } catch {
      // ignore
    }
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

  function setup() {
    const dbPath = path.join(
      os.tmpdir(),
      `resolve-session-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    store = resetAuthSessionStoreForTests(dbPath);
    return store;
  }

  it('returns Chinese msg when token missing', () => {
    setup();
    expect(resolveBearerSession(null)).toEqual({
      ok: false,
      msg: '请先登录',
    });
  });

  it('returns auth payload for valid token', () => {
    const s = setup();
    const now = 1_700_000_000_000;
    const created = s.createSession('demo', 24, now);
    const result = resolveBearerSession(created.token, now + 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.username).toBe('demo');
      expect(result.auth.expiresAt).toBe(created.expiresAt);
      expect(result.auth.sessionId).toBe(created.id);
    }
  });

  it('returns expired Chinese msg after TTL', () => {
    const s = setup();
    const created = s.createSession('demo', 1, 1_700_000_000_000);
    const result = resolveBearerSession(
      created.token,
      created.expiresAt + 1,
    );
    expect(result).toEqual({
      ok: false,
      msg: '登录已过期，请重新登录',
    });
  });

  it('returns expired Chinese msg after revoke', () => {
    const s = setup();
    const now = 1_700_000_000_000;
    const created = s.createSession('demo', 24, now);
    s.revokeByToken(created.token, now + 1);
    expect(resolveBearerSession(created.token, now + 2)).toEqual({
      ok: false,
      msg: '登录已过期，请重新登录',
    });
  });
});
