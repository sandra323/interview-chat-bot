import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiCode, DEFAULT_MODEL_ID } from '@ai-chat/shared';
import { createApp } from '../server.js';
import { resetChatStoreForTests } from '../store/chatStore.js';
import type { ServerEnv } from '../config/env.js';
import { resetAuthSessionStoreForTests } from './sessionStore.js';

describe('conversation HTTP requireAuth', () => {
  const paths: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('demo', 4);
    const dbPath = path.join(
      os.tmpdir(),
      `conv-auth-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    resetAuthSessionStoreForTests(dbPath);
    resetChatStoreForTests(dbPath);

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

  it('rejects GET /api/conversations without Bearer', async () => {
    const { status, body } = await json('GET', '/api/conversations');
    expect(status).toBe(401);
    expect(body.code).toBe(ApiCode.UNAUTHORIZED);
    expect(body.msg).toMatch(/登录/);
    expect(body.data).toBeNull();
  });

  it('rejects invalid Bearer on conversations', async () => {
    const { status, body } = await json('GET', '/api/conversations', {
      token: 'not-a-real-token',
    });
    expect(status).toBe(401);
    expect(body.code).toBe(ApiCode.UNAUTHORIZED);
  });

  it('allows GET /api/conversations with valid Bearer', async () => {
    const login = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'demo' },
    });
    const token = (login.body.data as { token: string }).token;

    const { status, body } = await json('GET', '/api/conversations', {
      token,
    });
    expect(status).toBe(200);
    expect(body.code).toBe(ApiCode.SUCCESS);
    expect(body.data).toEqual({ items: [] });
  });

  it('keeps /health and login public', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);

    const login = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'demo' },
    });
    expect(login.status).toBe(200);
    expect(login.body.code).toBe(ApiCode.SUCCESS);
  });

  it('rejects PATCH/DELETE without Bearer', async () => {
    const patch = await json('PATCH', '/api/conversations/x', {
      body: { title: 't' },
    });
    expect(patch.status).toBe(401);
    expect(patch.body.code).toBe(ApiCode.UNAUTHORIZED);

    const del = await json('DELETE', '/api/conversations/x');
    expect(del.status).toBe(401);
    expect(del.body.code).toBe(ApiCode.UNAUTHORIZED);
  });
});
