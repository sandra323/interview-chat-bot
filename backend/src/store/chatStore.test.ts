import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatStore } from './chatStore.js';

describe('ChatStore', () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const p of paths) {
      try {
        fs.rmSync(p, { force: true });
      } catch {
        // ignore
      }
    }
    paths.length = 0;
  });

  function createStore() {
    const dbPath = path.join(
      os.tmpdir(),
      `chat-store-test-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    return new ChatStore(dbPath);
  }

  it('persists conversation messages and generation buffer', () => {
    const store = createStore();
    const conversationId = store.createConversation();
    store.appendMessage(conversationId, 'user', 'hello');
    const generationId = crypto.randomUUID();
    store.createGeneration(conversationId, generationId);

    const first = store.appendGenerationContent(generationId, 'Hel');
    expect(first).toEqual({ offset: 0, content: 'Hel' });
    const second = store.appendGenerationContent(generationId, 'lo');
    expect(second).toEqual({ offset: 3, content: 'Hello' });

    store.finalizeGeneration(generationId, 'completed');
    const messages = store.listChatMessages(conversationId);
    expect(messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hello' },
    ]);
    expect(store.getGeneration(generationId)?.status).toBe('completed');
    store.close();
  });

  it('keeps partial content on cancel', () => {
    const store = createStore();
    const conversationId = store.createConversation();
    const generationId = crypto.randomUUID();
    store.createGeneration(conversationId, generationId);
    store.appendGenerationContent(generationId, 'partial');
    store.finalizeGeneration(generationId, 'cancelled');
    expect(store.listChatMessages(conversationId)).toEqual([
      { role: 'assistant', content: 'partial' },
    ]);
    store.close();
  });

  it('fails orphaned running generations', () => {
    const store = createStore();
    const conversationId = store.createConversation();
    const generationId = crypto.randomUUID();
    store.createGeneration(conversationId, generationId);
    expect(store.failOrphanedRunningGenerations()).toBe(1);
    expect(store.getGeneration(generationId)?.status).toBe('error');
    store.close();
  });

  it('lists conversations with title from first user message', async () => {
    const store = createStore();
    const older = store.createConversation();
    store.appendMessage(older, 'user', '旧会话标题');
    const newer = store.createConversation();
    const longTitle = '新会话标题用来截断测试一二三四五六七八九十';
    store.appendMessage(newer, 'user', longTitle);
    // Empty row should not appear in the sidebar list
    store.createConversation();
    // Ensure newer sorts first even if earlier writes shared the same ms
    await new Promise((r) => setTimeout(r, 5));
    store.touchConversation(newer);

    const list = store.listConversations();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(newer);
    expect(list[0].title).toBe(longTitle);
    expect(list[0].generating).toBe(false);
    expect(list[1].id).toBe(older);
    expect(list[1].title).toBe('旧会话标题');
    store.close();
  });

  it('prunes stale empty conversations', () => {
    const store = createStore();
    const empty = store.createConversation();
    const kept = store.createConversation();
    store.appendMessage(kept, 'user', 'keep me');
    // olderThanMs=0: any empty row is eligible
    expect(store.pruneEmptyConversations(0)).toBe(1);
    expect(store.conversationExists(empty)).toBe(false);
    expect(store.conversationExists(kept)).toBe(true);
    store.close();
  });

  it('marks conversations with a running generation', () => {
    const store = createStore();
    const idle = store.createConversation();
    store.appendMessage(idle, 'user', 'idle');
    const busy = store.createConversation();
    store.appendMessage(busy, 'user', 'busy');
    store.createGeneration(busy, crypto.randomUUID());

    const list = store.listConversations();
    expect(list.find((c) => c.id === busy)?.generating).toBe(true);
    expect(list.find((c) => c.id === idle)?.generating).toBe(false);
    store.close();
  });

  it('pages messages with page=1 as newest batch', async () => {
    const store = createStore();
    const conversationId = store.createConversation();
    for (let i = 1; i <= 5; i += 1) {
      store.appendMessage(conversationId, 'user', `u${i}`);
      await new Promise((r) => setTimeout(r, 2));
      store.appendMessage(conversationId, 'assistant', `a${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }

    const page1 = store.listMessagesPage(conversationId, 1, 4);
    expect(page1.total).toBe(10);
    expect(page1.hasMore).toBe(true);
    expect(page1.items.map((m) => m.content)).toEqual([
      'u4',
      'a4',
      'u5',
      'a5',
    ]);

    const page2 = store.listMessagesPage(conversationId, 2, 4);
    expect(page2.hasMore).toBe(true);
    expect(page2.items.map((m) => m.content)).toEqual([
      'u2',
      'a2',
      'u3',
      'a3',
    ]);

    const page3 = store.listMessagesPage(conversationId, 3, 4);
    expect(page3.hasMore).toBe(false);
    expect(page3.items.map((m) => m.content)).toEqual(['u1', 'a1']);
    store.close();
  });
});
