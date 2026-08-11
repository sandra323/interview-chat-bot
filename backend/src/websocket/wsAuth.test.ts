import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ID } from '@ai-chat/shared';
import { createApp, attachWebSocketServer } from '../server.js';
import { resetChatStoreForTests } from '../store/chatStore.js';
import type { ServerEnv } from '../config/env.js';
import { resetAuthSessionStoreForTests } from '../auth/sessionStore.js';
import { ConnectionManager } from './connectionManager.js';

function waitForMessage(
  ws: WebSocket,
  predicate: (data: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for WS message'));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
    };

    ws.on('message', onMessage);
  });
}

describe('WS auth gate', () => {
  const paths: string[] = [];
  let server: Server | null = null;
  let baseUrl = '';
  let wsUrl = '';

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('demo', 4);
    const dbPath = path.join(os.tmpdir(), `ws-auth-${crypto.randomUUID()}.db`);
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
    attachWebSocketServer(server);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
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

  async function loginToken(): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'demo' }),
    });
    const body = (await res.json()) as { data: { token: string } };
    return body.data.token;
  }

  it('rejects hello before auth with UNAUTHORIZED', async () => {
    const ws = new WebSocket(wsUrl);
    const connectedP = waitForMessage(ws, (m) => m.type === 'connected');
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await connectedP;

    const errP = waitForMessage(ws, (m) => m.type === 'error');
    const closeP = new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
    });
    ws.send(JSON.stringify({ type: 'hello' }));

    const err = await errP;
    expect(err.code).toBe('UNAUTHORIZED');
    expect(String(err.message)).toMatch(/登录/);
    await closeP;
  });

  it('accepts auth then allows hello session', async () => {
    const token = await loginToken();
    const ws = new WebSocket(wsUrl);
    const connectedP = waitForMessage(ws, (m) => m.type === 'connected');
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await connectedP;

    const authOkP = waitForMessage(ws, (m) => m.type === 'auth_ok');
    ws.send(JSON.stringify({ type: 'auth', token }));
    await authOkP;

    const sessionP = waitForMessage(ws, (m) => m.type === 'session');
    ws.send(JSON.stringify({ type: 'hello' }));
    const session = await sessionP;
    expect(session.conversationId).toBeNull();
    ws.close();
  });

  it('rejects invalid auth token and closes', async () => {
    const ws = new WebSocket(wsUrl);
    const connectedP = waitForMessage(ws, (m) => m.type === 'connected');
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await connectedP;

    const errP = waitForMessage(ws, (m) => m.type === 'error');
    const closeP = new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
    });
    ws.send(JSON.stringify({ type: 'auth', token: 'bad-token' }));

    const err = await errP;
    expect(err.code).toBe('UNAUTHORIZED');
    await closeP;
  });

  it('allows ping before auth', async () => {
    const ws = new WebSocket(wsUrl);
    const connectedP = waitForMessage(ws, (m) => m.type === 'connected');
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await connectedP;

    ws.send(JSON.stringify({ type: 'ping' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});

describe('ConnectionManager auth deadline', () => {
  it('fires timeout when not cleared', async () => {
    const manager = new ConnectionManager();
    const fakeWs = {
      readyState: 1,
      OPEN: 1,
      send: () => undefined,
      close: () => undefined,
    } as unknown as import('ws').WebSocket;

    const connection = manager.addConnection(fakeWs);
    let fired = false;
    manager.armAuthDeadline(
      connection,
      () => {
        fired = true;
      },
      20,
    );

    await new Promise((r) => setTimeout(r, 40));
    expect(fired).toBe(true);
    manager.removeConnection(connection.connectionId);
  });
});
