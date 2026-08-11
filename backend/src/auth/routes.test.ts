import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiCode, DEFAULT_MODEL_ID } from '@ai-chat/shared';
import { createApp } from '../server.js';
import { resetAuthSessionStoreForTests } from './sessionStore.js';
import type { ServerEnv } from '../config/env.js';

describe('auth HTTP routes', () => {
  const paths: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';
  let passwordHash = '';

  beforeEach(async () => {
    passwordHash = await bcrypt.hash('demo', 4);
    const dbPath = path.join(
      os.tmpdir(),
      `auth-http-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    resetAuthSessionStoreForTests(dbPath);

    const env: ServerEnv = {
      port: 0,
      nodeEnv: 'test',
      corsOrigin: undefined,
      llmApiUrl: 'https://api.deepseek.com/chat/completions',
      llmApiKey: 'sk-test',
      defaultModel: DEFAULT_MODEL_ID,
      authUsername: 'demo',
      authPasswordHash: passwordHash,
      authSessionTtlHours: 24,
    };

    const app = createApp(env);
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
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

  async function json(
    method: string,
    urlPath: string,
    options: { body?: unknown; token?: string } = {},
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = (await res.json()) as {
      code: number;
      msg: string;
      data: unknown;
    };
    return { status: res.status, body };
  }

  it('POST /api/auth/login success returns token username expiresAt', async () => {
    const { status, body } = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'demo' },
    });
    expect(status).toBe(200);
    expect(body.code).toBe(ApiCode.SUCCESS);
    const data = body.data as {
      token: string;
      username: string;
      expiresAt: number;
    };
    expect(data.username).toBe('demo');
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(20);
    expect(data.expiresAt).toBeGreaterThan(Date.now());
  });

  it('POST /api/auth/login wrong password returns Chinese UNAUTHORIZED', async () => {
    const { status, body } = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'wrong' },
    });
    expect(status).toBe(401);
    expect(body.code).toBe(ApiCode.UNAUTHORIZED);
    expect(body.msg).toBe('账号或密码错误');
    expect(body.data).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
  });

  it('POST /api/auth/login empty body returns BAD_REQUEST Chinese', async () => {
    const { status, body } = await json('POST', '/api/auth/login', {
      body: { username: '', password: '' },
    });
    expect(status).toBe(400);
    expect(body.code).toBe(ApiCode.BAD_REQUEST);
    expect(body.msg).toMatch(/账号|密码/);
  });

  it('GET /api/auth/me with valid Bearer returns user fields', async () => {
    const login = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'demo' },
    });
    const token = (login.body.data as { token: string }).token;

    const { status, body } = await json('GET', '/api/auth/me', { token });
    expect(status).toBe(200);
    expect(body.code).toBe(ApiCode.SUCCESS);
    expect(body.data).toEqual({
      username: 'demo',
      expiresAt: (login.body.data as { expiresAt: number }).expiresAt,
    });
  });

  it('GET /api/auth/me without token returns UNAUTHORIZED', async () => {
    const { status, body } = await json('GET', '/api/auth/me');
    expect(status).toBe(401);
    expect(body.code).toBe(ApiCode.UNAUTHORIZED);
    expect(body.msg).toMatch(/登录/);
  });

  it('logout revokes session; subsequent me fails; logout without token succeeds', async () => {
    const login = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'demo' },
    });
    const token = (login.body.data as { token: string }).token;

    const logout = await json('POST', '/api/auth/logout', { token });
    expect(logout.status).toBe(200);
    expect(logout.body.code).toBe(ApiCode.SUCCESS);
    expect(logout.body.data).toEqual({ ok: true });

    const me = await json('GET', '/api/auth/me', { token });
    expect(me.status).toBe(401);
    expect(me.body.code).toBe(ApiCode.UNAUTHORIZED);
    expect(me.body.msg).toBe('登录已过期，请重新登录');

    const idempotent = await json('POST', '/api/auth/logout');
    expect(idempotent.status).toBe(200);
    expect(idempotent.body.code).toBe(ApiCode.SUCCESS);
  });

  it('GET /health stays public', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});
