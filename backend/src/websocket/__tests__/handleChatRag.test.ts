import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@ai-chat/shared';
import { KNOWLEDGE_BASE_SEARCH_TOOL } from '@ai-chat/shared';
import type { GenerationRunner } from '../../generation/generationRunner.js';
import { resetAuthSessionStoreForTests, getAuthSessionStore } from '../../auth/sessionStore.js';
import { getChatStore, resetChatStoreForTests } from '../../store/chatStore.js';
import {
  ConnectionManager,
  type ConnectionState,
} from '../connectionManager.js';
import { handleMessage } from '../handleMessage.js';
import type { RerankedHit } from '../../rag/retrievalTypes.js';
import { RetrievalUnavailableError } from '../../rag/retrievalErrors.js';
import {
  resetRetrieveForChatForTests,
  setGetKnowledgeBaseForTests,
  setSearchWithRerankForTests,
} from '../../rag/retrieveForChat.js';

const kbId = '11111111-1111-4111-8111-111111111111';
const otherKb = '22222222-2222-4222-8222-222222222222';

function hit(): RerankedHit {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    knowledgeBaseId: kbId,
    ownerUsername: 'demo',
    content: '春季赏花攻略',
    chunkIndex: 0,
    metadata: { filename: 'guide.md', page: 1 },
    embeddingModel: null,
    rrfScore: 1,
    fromVector: true,
    fromKeyword: true,
    vectorRank: 1,
    keywordRank: 1,
    relevanceScore: 0.9,
    reranked: true,
  };
}

describe('handleChatMessage RAG', () => {
  const paths: string[] = [];
  const previousKey = process.env.DEEPSEEK_API_KEY;
  let connection: ConnectionState;
  let started: Array<{ llmMessages: ChatMessage[] }>;
  let sent: Array<Record<string, unknown>>;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const dbPath = path.join(
      os.tmpdir(),
      `chat-rag-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    resetAuthSessionStoreForTests(dbPath);
    resetChatStoreForTests(dbPath);
    resetRetrieveForChatForTests();

    sent = [];
    const fakeWs = {
      readyState: 1,
      OPEN: 1,
      send: (raw: string) => {
        sent.push(JSON.parse(raw) as Record<string, unknown>);
      },
      close: () => undefined,
    };
    const manager = new ConnectionManager();
    connection = manager.addConnection(fakeWs as never);
    const session = getAuthSessionStore().createSession('demo', 24);
    connection.authenticated = true;
    connection.sessionId = session.id;
    connection.username = 'demo';

    started = [];
    void manager;
  });

  afterEach(() => {
    resetRetrieveForChatForTests();
    if (previousKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = previousKey;
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

  function runner(): GenerationRunner {
    return {
      start: (params: { llmMessages: ChatMessage[] }) => {
        started.push(params);
      },
      stop: () => false,
    } as unknown as GenerationRunner;
  }

  async function chat(body: Record<string, unknown>) {
    const manager = new ConnectionManager();
    await handleMessage(
      JSON.stringify({ type: 'chat', content: '公园怎么赏花', ...body }),
      connection,
      manager,
      runner(),
    );
  }

  it('does not inject RAG when no knowledge base is bound', async () => {
    const search = async () => {
      throw new Error('should not search');
    };
    setSearchWithRerankForTests(search as never);
    await chat({});
    expect(started).toHaveLength(1);
    expect(started[0]?.llmMessages).toEqual([
      { role: 'user', content: '公园怎么赏花' },
    ]);
    expect(sent.some((m) => m.type === 'tool_event')).toBe(false);
    const stored = getChatStore().listMessagesPage(
      connection.conversationId ?? '',
    );
    expect(stored.items.map((m) => m.content)).toEqual(['公园怎么赏花']);
  });

  it('injects excerpts without persisting them', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'demo',
      name: '默认资料库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => [hit()]);
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId });

    const llm = started[0]?.llmMessages ?? [];
    expect(llm[0]?.role).toBe('system');
    expect(llm[1]?.content).toContain('<<<KB>>>');
    expect(llm[1]?.content).toContain('春季赏花攻略');
    expect(llm.at(-1)).toEqual({ role: 'user', content: '公园怎么赏花' });
    expect(sent.some((m) => m.type === 'tool_event' && m.event === 'start')).toBe(
      true,
    );
    expect(
      sent.some(
        (m) =>
          m.type === 'tool_event' &&
          m.name === KNOWLEDGE_BASE_SEARCH_TOOL &&
          m.event === 'end',
      ),
    ).toBe(true);
    const page = getChatStore().listMessagesPage(conversationId);
    expect(page.items.map((m) => m.role)).toEqual(['user']);
    expect(page.items[0]?.content).toBe('公园怎么赏花');
  });

  it('injects empty-recall copy when search returns no hits', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'demo',
      name: '默认资料库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => []);
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId });
    const text = started[0]?.llmMessages.map((m) => m.content).join('\n') ?? '';
    expect(text).toContain('未在知识库中找到');
    expect(text).toContain('默认资料库');
  });

  it('still generates when retrieval is unavailable', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'demo',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => {
      throw new RetrievalUnavailableError();
    });
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId });
    expect(started).toHaveLength(1);
    expect(sent.some((m) => m.type === 'tool_event' && m.event === 'error')).toBe(
      true,
    );
    expect(sent.some((m) => m.type === 'reply_start')).toBe(true);
    const text = started[0]?.llmMessages.map((m) => m.content).join('\n') ?? '';
    expect(text).toContain('暂时不可用');
  });

  it('ignores a client knowledgeBaseId for another owner when unbound', async () => {
    const searched: string[] = [];
    setGetKnowledgeBaseForTests(async (id, owner) => {
      if (owner === 'demo' && id === kbId) {
        return {
          id: kbId,
          ownerUsername: 'demo',
          name: '我的',
          description: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    });
    setSearchWithRerankForTests(async (input) => {
      searched.push(input.knowledgeBaseId);
      return [hit()];
    });
    await chat({ knowledgeBaseId: otherKb });
    expect(searched).toEqual([]);
    expect(started[0]?.llmMessages).toEqual([
      { role: 'user', content: '公园怎么赏花' },
    ]);
  });

  it('keeps the conversation binding when the client sends another id', async () => {
    setGetKnowledgeBaseForTests(async (id) => {
      if (id === kbId) {
        return {
          id: kbId,
          ownerUsername: 'demo',
          name: '我的',
          description: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    });
    const searched: string[] = [];
    setSearchWithRerankForTests(async (input) => {
      searched.push(input.knowledgeBaseId);
      return [hit()];
    });
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId, knowledgeBaseId: otherKb });
    expect(searched).toEqual([kbId]);
    expect(started[0]?.llmMessages[1]?.content).toContain('春季赏花攻略');
  });

  it('clears stale bindings without retrieval when the knowledge base is gone', async () => {
    setGetKnowledgeBaseForTests(async () => null);
    setSearchWithRerankForTests(async () => {
      throw new Error('should not search');
    });
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId });
    expect(getChatStore().getConversationKnowledgeBaseId(conversationId)).toBeNull();
    expect(
      sent.some((m) => m.type === 'tool_event' && m.event === 'start'),
    ).toBe(false);
    const text = started[0]?.llmMessages.map((m) => m.content).join('\n') ?? '';
    expect(text).not.toContain('<<<KB>>>');
    expect(text).not.toContain('已不存在或无权使用');
  });

  it('lazy-binds an owned client knowledgeBaseId when the conversation is unbound', async () => {
    setGetKnowledgeBaseForTests(async (id, owner) => {
      if (id === kbId && owner === 'demo') {
        return {
          id: kbId,
          ownerUsername: 'demo',
          name: '懒绑定库',
          description: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    });
    setSearchWithRerankForTests(async () => [hit()]);
    const conversationId = getChatStore().createConversation();
    await chat({ conversationId, knowledgeBaseId: kbId });
    expect(getChatStore().getConversationKnowledgeBaseId(conversationId)).toBe(
      kbId,
    );
    expect(started[0]?.llmMessages[1]?.content).toContain('春季赏花攻略');
  });

  it('sends reply_start only after retrieval tool_event end', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'demo',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => [hit()]);
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId });
    const toolEnd = sent.findIndex(
      (m) => m.type === 'tool_event' && m.event === 'end',
    );
    const replyStart = sent.findIndex((m) => m.type === 'reply_start');
    expect(toolEnd).toBeGreaterThan(-1);
    expect(replyStart).toBeGreaterThan(toolEnd);
  });

  it('does not start generation when stop aborts an in-flight retrieval', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'demo',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(
      () => new Promise(() => undefined) as Promise<RerankedHit[]>,
    );
    const conversationId = getChatStore().createConversation();
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    const manager = new ConnectionManager();
    const chatPromise = handleMessage(
      JSON.stringify({
        type: 'chat',
        content: '公园怎么赏花',
        conversationId,
      }),
      connection,
      manager,
      runner(),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const running = getChatStore().getRunningGeneration(conversationId);
    expect(running?.id).toBeTruthy();
    await handleMessage(
      JSON.stringify({
        type: 'stop',
        conversationId,
        generationId: running!.id,
      }),
      connection,
      manager,
      runner(),
    );
    await chatPromise;
    expect(started).toHaveLength(0);
    expect(sent.some((m) => m.type === 'reply_start')).toBe(false);
  });

  it('injects RAG for multi-turn history without persisting system rows', async () => {
    setGetKnowledgeBaseForTests(async () => ({
      id: kbId,
      ownerUsername: 'demo',
      name: '库',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    setSearchWithRerankForTests(async () => [hit()]);
    const conversationId = getChatStore().createConversation();
    getChatStore().appendMessage(conversationId, 'user', '上一问');
    getChatStore().appendMessage(conversationId, 'assistant', '上一答');
    getChatStore().setConversationKnowledgeBaseId(conversationId, kbId);
    await chat({ conversationId });

    const llm = started[0]?.llmMessages ?? [];
    expect(llm[0]?.role).toBe('system');
    expect(llm[2]).toEqual({ role: 'user', content: '上一问' });
    expect(llm[3]).toEqual({ role: 'assistant', content: '上一答' });
    expect(llm.at(-1)).toEqual({ role: 'user', content: '公园怎么赏花' });
    const page = getChatStore().listMessagesPage(conversationId);
    expect(page.items.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});
