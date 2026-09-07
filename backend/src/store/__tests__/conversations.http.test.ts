import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiCode, DEFAULT_MODEL_ID } from '@ai-chat/shared';
import { createApp } from '../../server.js';
import { getChatStore, resetChatStoreForTests } from '../chatStore.js';
import type { ServerEnv } from '../../config/env.js';
import { resetAuthSessionStoreForTests } from '../../auth/sessionStore.js';

describe('conversation knowledgeBaseId HTTP', () => {
  const paths: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('demo', 4);
    const dbPath = path.join(
      os.tmpdir(),
      `conv-kb-${crypto.randomUUID()}.db`,
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
      databaseUrl: '',
      openaiApiKey: '',
      openaiEmbeddingModel: 'text-embedding-3-small',
      openaiEmbeddingModelVersion: 'text-embedding-3-small@2024-01-25',
      voyageApiKey: '',
      voyageRerankModel: 'rerank-2-lite',
      voyageRerankUrl: 'https://api.voyageai.com/v1/rerank',
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
      data: Record<string, unknown> | null;
    };
    return { status: res.status, body };
  }

  async function token(): Promise<string> {
    const login = await json('POST', '/api/auth/login', {
      body: { username: 'demo', password: 'demo' },
    });
    return (login.body.data as { token: string }).token;
  }

  it('renames without touching knowledgeBaseId', async () => {
    const auth = await token();
    const id = getChatStore().createConversation();
    getChatStore().appendMessage(id, 'user', 'hi');
    const renamed = await json('PATCH', `/api/conversations/${id}`, {
      token: auth,
      body: { title: '自定义' },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({
      id,
      title: '自定义',
      knowledgeBaseId: null,
    });
  });

  it('unbinds with knowledgeBaseId null', async () => {
    const auth = await token();
    const id = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(
      id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const unbound = await json('PATCH', `/api/conversations/${id}`, {
      token: auth,
      body: { knowledgeBaseId: null },
    });
    expect(unbound.status).toBe(200);
    expect(unbound.body.data?.knowledgeBaseId).toBeNull();
    expect(getChatStore().getConversationKnowledgeBaseId(id)).toBeNull();
  });

  it('rejects empty patch and invalid uuid', async () => {
    const auth = await token();
    const id = getChatStore().createConversation();
    const empty = await json('PATCH', `/api/conversations/${id}`, {
      token: auth,
      body: {},
    });
    expect(empty.status).toBe(400);
    expect(empty.body.msg).toMatch(/没有要更新/);

    const bad = await json('PATCH', `/api/conversations/${id}`, {
      token: auth,
      body: { knowledgeBaseId: 'nope' },
    });
    expect(bad.status).toBe(400);
  });

  it('does not bind when postgres is disabled', async () => {
    const auth = await token();
    const id = getChatStore().createConversation();
    const kbId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const bind = await json('PATCH', `/api/conversations/${id}`, {
      token: auth,
      body: { knowledgeBaseId: kbId },
    });
    expect(bind.status).toBe(503);
    expect(getChatStore().getConversationKnowledgeBaseId(id)).toBeNull();
  });

  it('returns knowledgeBaseId on message pages', async () => {
    const auth = await token();
    const id = getChatStore().createConversation();
    const kbId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    getChatStore().appendMessage(id, 'user', 'q');
    getChatStore().setConversationKnowledgeBaseId(id, kbId);
    const page = await json('GET', `/api/conversations/${id}/messages`, {
      token: auth,
    });
    expect(page.status).toBe(200);
    expect(page.body.data?.knowledgeBaseId).toBe(kbId);
  });
});
