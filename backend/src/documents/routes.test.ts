import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiCode, DEFAULT_MODEL_ID } from '@ai-chat/shared';
import { createApp } from '../server.js';
import { resetAuthSessionStoreForTests } from '../auth/sessionStore.js';
import { resetLoginRateGuardForTests } from '../auth/loginRateLimit.js';
import { resetDocumentStoreForTests } from './documentStore.js';
import { resetFileStorageForTests } from './fileStorage.js';
import type { ServerEnv } from '../config/env.js';

describe('documents HTTP routes without PostgreSQL', () => {
  const paths: string[] = [];
  const dirs: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';
  let passwordHash = '';

  beforeEach(async () => {
    passwordHash = await bcrypt.hash('demo', 4);
    const dbPath = path.join(
      os.tmpdir(),
      `doc-http-${crypto.randomUUID()}.db`,
    );
    const uploadsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'doc-uploads-'),
    );
    paths.push(dbPath);
    dirs.push(uploadsDir);
    resetAuthSessionStoreForTests(dbPath);
    resetDocumentStoreForTests(dbPath);
    resetFileStorageForTests(uploadsDir);
    resetLoginRateGuardForTests({
      windowMs: 60_000,
      maxFailures: 5,
      maxRequestsPerIp: 100,
    });

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
      databaseUrl: '',
      openaiApiKey: '',
      openaiEmbeddingModel: 'text-embedding-3-small',
      openaiEmbeddingModelVersion: 'text-embedding-3-small@2024-01-25',
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
        // 忽略
      }
    }
    paths.length = 0;
    for (const dir of dirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // 忽略
      }
    }
    dirs.length = 0;
  });

  async function login(): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'demo' }),
    });
    const body = (await res.json()) as { data: { token: string } };
    return body.data.token;
  }

  it('requires auth for list', async () => {
    const res = await fetch(`${baseUrl}/api/documents`);
    const body = (await res.json()) as { code: number };
    expect(res.status).toBe(401);
    expect(body.code).toBe(ApiCode.UNAUTHORIZED);
  });

  it('returns 503 when knowledge base storage is not configured', async () => {
    const token = await login();
    const listRes = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = (await listRes.json()) as { code: number; msg: string };
    expect(listRes.status).toBe(503);
    expect(listBody.code).toBe(ApiCode.INTERNAL_ERROR);
    expect(listBody.msg).toMatch(/知识库服务未启用/);

    const form = new FormData();
    form.append(
      'file',
      new Blob(['# hello'], { type: 'text/markdown' }),
      '指南.md',
    );
    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(uploadRes.status).toBe(503);

    const kbRes = await fetch(`${baseUrl}/api/knowledge-bases`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(kbRes.status).toBe(503);
  });
});
