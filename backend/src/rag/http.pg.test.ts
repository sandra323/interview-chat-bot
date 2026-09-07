import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiCode,
  DEFAULT_KNOWLEDGE_BASE_NAME,
  DEFAULT_MODEL_ID,
} from '@ai-chat/shared';
import { createApp } from '../server.js';
import { resetAuthSessionStoreForTests } from '../auth/sessionStore.js';
import { resetLoginRateGuardForTests } from '../auth/loginRateLimit.js';
import {
  getFileStorage,
  resetFileStorageForTests,
} from '../documents/fileStorage.js';
import { loadEnvFiles, type ServerEnv } from '../config/env.js';
import { getPool, initPg, resetPoolForTests } from './pg.js';
import {
  createKnowledgeBase,
  getOrCreateDefaultForOwner,
} from './knowledgeBaseStore.js';
import { deleteByIdForOwner, getByIdForOwner, insert } from './pgDocumentStore.js';
import { resumeIncompleteParses, waitForParseIdle } from './ingestWorker.js';
import { countForDocument, listChunkIdsForDocument } from './chunkStore.js';
import {
  createDeterministicEmbeddings,
  resetEmbedderForTests,
  setEmbedderForTests,
} from './embedder.js';
import { sha256Hex } from './contentHash.js';
import { migrateDocumentsFromSqlite } from './migrateDocuments.js';
import {
  ensureTestDatabase,
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from './testDatabase.js';

loadEnvFiles();
const previousDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = resolvePgTestDatabaseUrl();

describe.skipIf(!testDatabaseUrl)('KB + documents HTTP with PostgreSQL', () => {
  const sqlitePaths: string[] = [];
  const dirs: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';
  let passwordHash = '';
  let uploadsDir = '';

  beforeAll(async () => {
    if (!isSafeTestDatabaseUrl(testDatabaseUrl)) {
      throw new Error('Refusing to run PG tests against a non-test database');
    }
    await ensureTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    await initPg();
  });

  afterAll(async () => {
    await resetPoolForTests();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  beforeEach(async () => {
    passwordHash = await bcrypt.hash('demo', 4);
    const dbPath = path.join(
      os.tmpdir(),
      `rag-http-${crypto.randomUUID()}.db`,
    );
    uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-uploads-'));
    sqlitePaths.push(dbPath);
    dirs.push(uploadsDir);
    resetAuthSessionStoreForTests(dbPath);
    resetFileStorageForTests(uploadsDir);
    resetLoginRateGuardForTests({
      windowMs: 60_000,
      maxFailures: 5,
      maxRequestsPerIp: 100,
    });
    if (!isSafeTestDatabaseUrl(process.env.DATABASE_URL ?? '')) {
      throw new Error('Refusing to TRUNCATE a non-test database');
    }
    await getPool().query(
      'TRUNCATE document_chunks, documents, knowledge_bases CASCADE',
    );
    setEmbedderForTests(async (texts) => createDeterministicEmbeddings(texts));

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
      databaseUrl: testDatabaseUrl,
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
    await waitForParseIdle();
    resetEmbedderForTests();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
    }
    for (const p of sqlitePaths) {
      try {
        fs.rmSync(p, { force: true });
        fs.rmSync(`${p}-wal`, { force: true });
        fs.rmSync(`${p}-shm`, { force: true });
      } catch {
        // 忽略
      }
    }
    sqlitePaths.length = 0;
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

  async function authJson(
    token: string,
    method: string,
    urlPath: string,
    body?: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('CRUD knowledge bases and hides other owners by 404', async () => {
    const token = await login();
    const created = await authJson(token, 'POST', '/api/knowledge-bases', {
      name: '面试题库',
      description: '个人',
    });
    expect(created.status).toBe(200);
    const kb = created.body.data as { id: string; name: string };
    expect(kb.name).toBe('面试题库');

    const listed = await authJson(token, 'GET', '/api/knowledge-bases');
    expect(
      (listed.body.data as { items: Array<{ id: string }> }).items,
    ).toHaveLength(1);

    const patched = await authJson(token, 'PATCH', `/api/knowledge-bases/${kb.id}`, {
      name: '面试题库-改',
    });
    expect((patched.body.data as { name: string }).name).toBe('面试题库-改');

    const aliceKb = await createKnowledgeBase('alice', '别人的库');
    const stolen = await authJson(token, 'GET', `/api/knowledge-bases/${aliceKb.id}`);
    expect(stolen.status).toBe(404);
    expect(stolen.body.code).toBe(ApiCode.NOT_FOUND);

    const deleted = await authJson(
      token,
      'DELETE',
      `/api/knowledge-bases/${kb.id}`,
    );
    expect(deleted.status).toBe(200);
  });

  it('uploads to a KB, parses to ready, writes content_hash, and rejects duplicates', async () => {
    const token = await login();
    const created = await authJson(token, 'POST', '/api/knowledge-bases', {
      name: '库A',
    });
    const kbId = (created.body.data as { id: string }).id;
    const content = '# hello hash';
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'text/markdown' }), '指南.md');

    const uploadRes = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbId}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const uploadBody = (await uploadRes.json()) as {
      code: number;
      data: { id: string; filename: string; status: string };
    };
    expect(uploadRes.status).toBe(200);
    expect(uploadBody.data.status).toBe('pending');
    expect(uploadBody.data.filename).toBe('指南.md');

    await waitForParseIdle();
    const stored = await getByIdForOwner(uploadBody.data.id, 'demo');
    expect(stored?.status).toBe('ready');
    expect(stored?.contentHash).toBe(sha256Hex(Buffer.from(content)));

    const dupForm = new FormData();
    dupForm.append(
      'file',
      new Blob([content], { type: 'text/markdown' }),
      '指南-副本.md',
    );
    const dupRes = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbId}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: dupForm,
      },
    );
    const dupBody = (await dupRes.json()) as { msg: string };
    expect(dupRes.status).toBe(400);
    expect(dupBody.msg).toMatch(/相同文件/);
  });

  it('POST /api/documents uses the default knowledge base', async () => {
    const token = await login();
    const form = new FormData();
    form.append('file', new Blob(['hello txt'], { type: 'text/plain' }), 'a.txt');
    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = (await uploadRes.json()) as {
      data: { id: string; status: string };
    };
    expect(uploadRes.status).toBe(200);
    expect(uploadBody.data.status).toBe('pending');
    await waitForParseIdle();

    const kbs = await authJson(token, 'GET', '/api/knowledge-bases');
    const items = (kbs.body.data as { items: Array<{ name: string }> }).items;
    expect(items.some((kb) => kb.name === DEFAULT_KNOWLEDGE_BASE_NAME)).toBe(
      true,
    );

    const stored = await getByIdForOwner(uploadBody.data.id, 'demo');
    expect(stored?.status).toBe('ready');
  });

  it('marks unreadable text as failed and blocks cross-user document access', async () => {
    const token = await login();
    const created = await authJson(token, 'POST', '/api/knowledge-bases', {
      name: '库B',
    });
    const kbId = (created.body.data as { id: string }).id;
    const form = new FormData();
    form.append('file', new Blob(['   \n\n'], { type: 'text/plain' }), 'blank.txt');
    const uploadRes = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbId}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const uploadBody = (await uploadRes.json()) as { data: { id: string } };
    await waitForParseIdle();
    const failed = await getByIdForOwner(uploadBody.data.id, 'demo');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toMatch(/提取文字/);

    const aliceKb = await createKnowledgeBase('alice', 'alice-kb');
    const stolenList = await fetch(
      `${baseUrl}/api/knowledge-bases/${aliceKb.id}/documents`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(stolenList.status).toBe(404);

    const contentRes = await fetch(
      `${baseUrl}/api/documents/${uploadBody.data.id}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(contentRes.status).toBe(404);
  });

  it('blocks IDOR on KB mutate/upload and document delete/preview', async () => {
    const token = await login();
    const aliceKb = await createKnowledgeBase('alice', 'alice-secret');
    const aliceDoc = await insert({
      id: crypto.randomUUID(),
      knowledgeBaseId: aliceKb.id,
      ownerUsername: 'alice',
      filename: 'secret.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
      storagePath: 'alice/secret.txt',
      contentHash: sha256Hex(Buffer.from('alice')),
      status: 'ready',
      progress: 100,
      error: null,
      sourceRelativePath: null,
    });

    const patched = await authJson(
      token,
      'PATCH',
      `/api/knowledge-bases/${aliceKb.id}`,
      { name: '被改名' },
    );
    expect(patched.status).toBe(404);

    const deletedKb = await authJson(
      token,
      'DELETE',
      `/api/knowledge-bases/${aliceKb.id}`,
    );
    expect(deletedKb.status).toBe(404);

    const stealUpload = await fetch(
      `${baseUrl}/api/knowledge-bases/${aliceKb.id}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: (() => {
          const form = new FormData();
          form.append(
            'file',
            new Blob(['stolen'], { type: 'text/plain' }),
            'x.txt',
          );
          return form;
        })(),
      },
    );
    expect(stealUpload.status).toBe(404);

    const deletedDoc = await authJson(
      token,
      'DELETE',
      `/api/documents/${aliceDoc.id}`,
    );
    expect(deletedDoc.status).toBe(404);

    const preview = await fetch(
      `${baseUrl}/api/documents/${aliceDoc.id}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(preview.status).toBe(404);

    const stillAlice = await getByIdForOwner(aliceDoc.id, 'alice');
    expect(stillAlice?.filename).toBe('secret.txt');
  });

  it('keeps same-owner knowledge bases isolated and allows the same hash in both', async () => {
    const token = await login();
    const a = await authJson(token, 'POST', '/api/knowledge-bases', {
      name: '库一',
    });
    const b = await authJson(token, 'POST', '/api/knowledge-bases', {
      name: '库二',
    });
    const kbA = (a.body.data as { id: string }).id;
    const kbB = (b.body.data as { id: string }).id;
    const content = 'same-bytes-two-kbs';

    const uploadA = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbA}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: (() => {
          const form = new FormData();
          form.append(
            'file',
            new Blob([content], { type: 'text/plain' }),
            'a.txt',
          );
          return form;
        })(),
      },
    );
    const bodyA = (await uploadA.json()) as { data: { id: string } };
    expect(uploadA.status).toBe(200);

    const uploadB = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbB}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: (() => {
          const form = new FormData();
          form.append(
            'file',
            new Blob([content], { type: 'text/plain' }),
            'b.txt',
          );
          return form;
        })(),
      },
    );
    const bodyB = (await uploadB.json()) as { data: { id: string } };
    expect(uploadB.status).toBe(200);
    expect(bodyB.data.id).not.toBe(bodyA.data.id);

    await waitForParseIdle();

    const listA = await authJson(
      token,
      'GET',
      `/api/knowledge-bases/${kbA}/documents`,
    );
    const itemsA = (
      listA.body.data as { items: Array<{ id: string; filename: string }> }
    ).items;
    expect(itemsA.map((item) => item.id)).toEqual([bodyA.data.id]);
    expect(itemsA[0]?.filename).toBe('a.txt');
  });

  it('migrates SQLite documents even when a knowledge base already exists', async () => {
    const existing = await getOrCreateDefaultForOwner('migrated-owner');
    const sqlitePath = path.join(
      os.tmpdir(),
      `rag-migrate-${crypto.randomUUID()}.db`,
    );
    sqlitePaths.push(sqlitePath);
    const db = new Database(sqlitePath);
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        owner_username TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        source_relative_path TEXT
      )
    `);
    const docId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      docId,
      'migrated-owner',
      'old.txt',
      'text/plain',
      4,
      'migrated-owner/old.txt',
      'ready',
      100,
      null,
      Date.now(),
      null,
    );
    db.close();

    const first = await migrateDocumentsFromSqlite(sqlitePath);
    expect(first.skipped).toBe(false);
    expect(first.documents).toBe(1);
    const stored = await getByIdForOwner(docId, 'migrated-owner');
    expect(stored?.knowledgeBaseId).toBe(existing.id);

    const second = await migrateDocumentsFromSqlite(sqlitePath);
    expect(second.skipped).toBe(false);
    expect(second.documents).toBe(0);
  });

  it('re-enqueues pending documents after a simulated restart', async () => {
    const kb = await createKnowledgeBase('demo', '恢复库');
    const id = crypto.randomUUID();
    const storage = getFileStorage();
    const relativePath = storage.relativePath('demo', id, '.txt');
    storage.write(relativePath, Buffer.from('resume me'));
    await insert({
      id,
      knowledgeBaseId: kb.id,
      ownerUsername: 'demo',
      filename: 'resume.txt',
      mimeType: 'text/plain',
      sizeBytes: 9,
      storagePath: relativePath,
      contentHash: sha256Hex(Buffer.from('resume me')),
      status: 'pending',
      progress: 0,
      error: null,
      sourceRelativePath: null,
    });

    const enqueued = await resumeIncompleteParses();
    expect(enqueued).toBeGreaterThanOrEqual(1);
    await waitForParseIdle();
    const stored = await getByIdForOwner(id, 'demo');
    expect(stored?.status).toBe('ready');
  });
  it('writes embeddings and chunk metadata on upload', async () => {
    const token = await login();
    const form = new FormData();
    form.append(
      'file',
      new Blob(['# 标题\n\n内容段落。'.repeat(20)], { type: 'text/markdown' }),
      'long.md',
    );
    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = (await uploadRes.json()) as { data: { id: string } };
    await waitForParseIdle();
    const stored = await getByIdForOwner(uploadBody.data.id, 'demo');
    expect(stored?.status).toBe('ready');
    expect(stored?.chunkCount).toBeGreaterThanOrEqual(1);
    expect(stored?.embeddingModel).toBeTruthy();
    const count = await countForDocument('demo', uploadBody.data.id);
    expect(count).toBe(stored?.chunkCount);
  });

  it('reprocess replaces chunks; busy and cross-user are rejected', async () => {
    setEmbedderForTests(async (texts) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return createDeterministicEmbeddings(texts);
    });
    const token = await login();
    const form = new FormData();
    form.append('file', new Blob(['reprocess me'], { type: 'text/plain' }), 'r.txt');
    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = (await uploadRes.json()) as { data: { id: string } };
    await waitForParseIdle();
    const before = await listChunkIdsForDocument('demo', uploadBody.data.id);
    expect(before.length).toBeGreaterThanOrEqual(1);

    const again = await authJson(
      token,
      'POST',
      `/api/documents/${uploadBody.data.id}/reprocess`,
    );
    expect(again.status).toBe(200);
    const busy = await authJson(
      token,
      'POST',
      `/api/documents/${uploadBody.data.id}/reprocess`,
    );
    expect(busy.status).toBe(400);

    await waitForParseIdle();
    const after = await listChunkIdsForDocument('demo', uploadBody.data.id);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after).not.toEqual(before);

    const aliceKb = await createKnowledgeBase('alice', 'alice-rp');
    const aliceDoc = await insert({
      id: crypto.randomUUID(),
      knowledgeBaseId: aliceKb.id,
      ownerUsername: 'alice',
      filename: 'secret.txt',
      mimeType: 'text/plain',
      sizeBytes: 1,
      storagePath: 'alice/s.txt',
      contentHash: sha256Hex(Buffer.from('x')),
      status: 'failed',
      progress: 0,
      error: 'x',
      sourceRelativePath: null,
    });
    const stolen = await authJson(
      token,
      'POST',
      `/api/documents/${aliceDoc.id}/reprocess`,
    );
    expect(stolen.status).toBe(404);
  });

  it('clears chunks when deleting a document or knowledge base', async () => {
    const token = await login();
    const created = await authJson(token, 'POST', '/api/knowledge-bases', {
      name: '待删库',
    });
    const kbId = (created.body.data as { id: string }).id;
    const form = new FormData();
    form.append('file', new Blob(['bye chunks'], { type: 'text/plain' }), 'c.txt');
    const uploadRes = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbId}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const uploadBody = (await uploadRes.json()) as { data: { id: string } };
    await waitForParseIdle();
    expect(await countForDocument('demo', uploadBody.data.id)).toBeGreaterThan(0);

    const deletedDoc = await authJson(
      token,
      'DELETE',
      `/api/documents/${uploadBody.data.id}`,
    );
    expect(deletedDoc.status).toBe(200);
    expect(await countForDocument('demo', uploadBody.data.id)).toBe(0);

    const form2 = new FormData();
    form2.append('file', new Blob(['kb cascade'], { type: 'text/plain' }), 'd.txt');
    const upload2 = await fetch(
      `${baseUrl}/api/knowledge-bases/${kbId}/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form2,
      },
    );
    const body2 = (await upload2.json()) as { data: { id: string } };
    await waitForParseIdle();
    await authJson(token, 'DELETE', `/api/knowledge-bases/${kbId}`);
    expect(await countForDocument('demo', body2.data.id)).toBe(0);
  });

  it('stops ingest without marking failed if the document is deleted', async () => {
    const token = await login();
    const form = new FormData();
    form.append('file', new Blob(['vanishing'], { type: 'text/plain' }), 'v.txt');
    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = (await uploadRes.json()) as { data: { id: string } };
    await deleteByIdForOwner(uploadBody.data.id, 'demo');
    await waitForParseIdle();
    const gone = await getByIdForOwner(uploadBody.data.id, 'demo');
    expect(gone).toBeNull();
    expect(await countForDocument('demo', uploadBody.data.id)).toBe(0);
  });

});
