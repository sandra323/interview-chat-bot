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

describe('documents HTTP routes', () => {
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

  it('uploads markdown, lists with search, and returns content', async () => {
    const token = await login();
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
    const uploadBody = (await uploadRes.json()) as {
      code: number;
      data: { id: string; filename: string; status: string; progress: number };
    };
    expect(uploadRes.status).toBe(200);
    expect(uploadBody.code).toBe(ApiCode.SUCCESS);
    expect(uploadBody.data.filename).toBe('指南.md');
    expect(uploadBody.data.status).toBe('ready');
    expect(uploadBody.data.progress).toBe(100);

    const listRes = await fetch(
      `${baseUrl}/api/documents?q=${encodeURIComponent('指南')}&page=1&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const listBody = (await listRes.json()) as {
      data: { items: Array<{ id: string }>; total: number; pageSize: number };
    };
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.pageSize).toBe(10);
    expect(listBody.data.items[0]?.id).toBe(uploadBody.data.id);

    const contentRes = await fetch(
      `${baseUrl}/api/documents/${uploadBody.data.id}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers.get('content-type')).toMatch(/markdown/);
    expect(await contentRes.text()).toBe('# hello');
  });

  it('deletes an uploaded file and its content', async () => {
    const token = await login();
    const form = new FormData();
    form.append(
      'file',
      new Blob(['# bye'], { type: 'text/markdown' }),
      'remove.md',
    );
    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const id = (
      (await uploadRes.json()) as { data: { id: string } }
    ).data.id;

    const delRes = await fetch(`${baseUrl}/api/documents/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const delBody = (await delRes.json()) as {
      code: number;
      data: { id: string };
    };
    expect(delRes.status).toBe(200);
    expect(delBody.code).toBe(ApiCode.SUCCESS);
    expect(delBody.data.id).toBe(id);

    const listRes = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = (await listRes.json()) as { data: { total: number } };
    expect(listBody.data.total).toBe(0);

    const contentRes = await fetch(`${baseUrl}/api/documents/${id}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(contentRes.status).toBe(404);
  });

  it('rejects unsupported file types', async () => {
    const token = await login();
    const form = new FormData();
    form.append(
      'file',
      new Blob(['png'], { type: 'image/png' }),
      'photo.png',
    );
    const res = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await res.json()) as { code: number; msg: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe(ApiCode.BAD_REQUEST);
    expect(body.msg).toMatch(/PDF|Markdown/);
  });

  it('rejects a non-pdf disguised as pdf', async () => {
    const token = await login();
    const form = new FormData();
    form.append(
      'file',
      new Blob(['not-a-pdf'], { type: 'application/pdf' }),
      'fake.pdf',
    );
    const res = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await res.json()) as { code: number; msg: string };
    expect(res.status).toBe(400);
    expect(body.msg).toMatch(/PDF/);
  });
});
