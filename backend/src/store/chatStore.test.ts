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
});
