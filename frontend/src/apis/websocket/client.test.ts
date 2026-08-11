import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketClient } from './client';

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('WebSocketClient auth handshake', () => {
  const OriginalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
    FakeWebSocket.instances = [];
    vi.restoreAllMocks();
  });

  function installFake() {
    // @ts-expect-error test stub
    globalThis.WebSocket = FakeWebSocket;
  }

  it('sends auth after connected and opens only after auth_ok', async () => {
    installFake();
    const statuses: string[] = [];
    const client = new WebSocketClient('ws://test/ws', {
      getAuthToken: () => 'tok-1',
    });
    client.onStatusChange((s) => statuses.push(s));
    client.connect();

    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const socket = FakeWebSocket.instances[0];
    expect(client.getStatus()).toBe('connecting');

    socket.emitMessage({ type: 'connected', connectionId: 'c1' });
    expect(socket.sent).toEqual([
      JSON.stringify({ type: 'auth', token: 'tok-1' }),
    ]);
    expect(client.getStatus()).toBe('connecting');

    socket.emitMessage({ type: 'auth_ok' });
    expect(client.getStatus()).toBe('open');
    expect(statuses).toContain('open');
  });

  it('blocks hello until auth_ok', async () => {
    installFake();
    const client = new WebSocketClient('ws://test/ws', {
      getAuthToken: () => 'tok-1',
    });
    client.connect();
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const socket = FakeWebSocket.instances[0];
    socket.emitMessage({ type: 'connected', connectionId: 'c1' });

    expect(client.send({ type: 'hello' })).toBe(false);

    socket.emitMessage({ type: 'auth_ok' });
    expect(client.send({ type: 'hello' })).toBe(true);
  });

  it('fails auth without token and does not reconnect', async () => {
    installFake();
    const onAuthFailure = vi.fn();
    const client = new WebSocketClient('ws://test/ws', {
      getAuthToken: () => null,
      onAuthFailure,
    });
    client.connect();
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const socket = FakeWebSocket.instances[0];
    socket.emitMessage({ type: 'connected', connectionId: 'c1' });

    expect(onAuthFailure).toHaveBeenCalledWith('missing_token');
    expect(client.getStatus()).toBe('closed');
  });

  it('fails on UNAUTHORIZED error', async () => {
    installFake();
    const onAuthFailure = vi.fn();
    const client = new WebSocketClient('ws://test/ws', {
      getAuthToken: () => 'tok-1',
      onAuthFailure,
    });
    client.connect();
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const socket = FakeWebSocket.instances[0];
    socket.emitMessage({ type: 'connected', connectionId: 'c1' });
    socket.emitMessage({
      type: 'error',
      code: 'UNAUTHORIZED',
      message: '请先登录',
    });

    expect(onAuthFailure).toHaveBeenCalledWith('unauthorized');
    expect(client.getStatus()).toBe('closed');
  });

  it('skipAuth opens immediately without auth message', async () => {
    installFake();
    const client = new WebSocketClient('ws://test/ws', { skipAuth: true });
    client.connect();
    await vi.waitFor(() => expect(client.getStatus()).toBe('open'));
    const socket = FakeWebSocket.instances[0];
    socket.emitMessage({ type: 'connected', connectionId: 'c1' });
    expect(socket.sent).toEqual([]);
  });
});
