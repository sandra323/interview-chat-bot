import { RETRIEVAL_TIMEOUT_MS } from './chunkConfig.js';
import { getByIdForOwner, type KnowledgeBaseRow } from './knowledgeBaseStore.js';
import { isKnowledgeBaseId } from './retrievalQuery.js';
import {
  RetrievalQueryError,
  RetrievalUnavailableError,
} from './retrievalErrors.js';
import { searchWithRerank } from './searchWithRerank.js';
import type { RerankedHit } from './retrievalTypes.js';
import { logger } from '../utils/logger.js';

export type RetrieveForChatKb = { id: string; name: string };

export type RetrieveForChatResult =
  | { kind: 'unbound' }
  | { kind: 'hits'; kb: RetrieveForChatKb; hits: RerankedHit[] }
  | { kind: 'empty'; kb: RetrieveForChatKb }
  | { kind: 'unavailable'; kb: RetrieveForChatKb | null }
  | { kind: 'kb_missing'; knowledgeBaseId: string };

export class RetrievalAbortedError extends Error {
  constructor() {
    super('retrieval-aborted');
    this.name = 'RetrievalAbortedError';
  }
}

type SearchWithRerankFn = typeof searchWithRerank;
type GetKbFn = (
  id: string,
  ownerUsername: string,
) => Promise<KnowledgeBaseRow | null>;

let searchImpl: SearchWithRerankFn = searchWithRerank;
let getKbImpl: GetKbFn = getByIdForOwner;

/** 单测注入检索实现，避免默认打 OpenAI / Voyage / PG。 */
export function setSearchWithRerankForTests(
  fn: SearchWithRerankFn | null,
): void {
  searchImpl = fn ?? searchWithRerank;
}

export function setGetKnowledgeBaseForTests(fn: GetKbFn | null): void {
  getKbImpl = fn ?? getByIdForOwner;
}

export function resetRetrieveForChatForTests(): void {
  searchImpl = searchWithRerank;
  getKbImpl = getByIdForOwner;
}

/** 与 retrieveForChat 同一套归属查询（含测试注入）。 */
export function lookupKnowledgeBaseForOwner(
  id: string,
  ownerUsername: string,
): Promise<KnowledgeBaseRow | null> {
  return getKbImpl(id, ownerUsername);
}

/**
 * Chat 侧唯一检索入口：校验归属后调用 searchWithRerank。
 * 空召回返回 empty；基础设施失败返回 unavailable；非法/非本人 UUID 返回 kb_missing，不拿客户端 id 重试。
 */
export async function retrieveForChat(input: {
  ownerUsername: string;
  knowledgeBaseId: string | null;
  query: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<RetrieveForChatResult> {
  const started = Date.now();
  if (!input.knowledgeBaseId) {
    return { kind: 'unbound' };
  }
  if (!isKnowledgeBaseId(input.knowledgeBaseId)) {
    logResult(input.knowledgeBaseId, 'kb_missing', 0, started);
    return { kind: 'kb_missing', knowledgeBaseId: input.knowledgeBaseId };
  }
  throwIfAborted(input.signal);

  let kb: RetrieveForChatKb | null = null;
  try {
    const row = await getKbImpl(input.knowledgeBaseId, input.ownerUsername);
    if (!row) {
      logResult(input.knowledgeBaseId, 'kb_missing', 0, started);
      return { kind: 'kb_missing', knowledgeBaseId: input.knowledgeBaseId };
    }
    kb = { id: row.id, name: row.name };

    const hits = await withTimeout(
      searchImpl({
        ownerUsername: input.ownerUsername,
        knowledgeBaseId: input.knowledgeBaseId,
        query: input.query,
      }),
      input.timeoutMs ?? RETRIEVAL_TIMEOUT_MS,
      input.signal,
    );
    if (hits.length === 0) {
      logResult(input.knowledgeBaseId, 'empty', 0, started);
      return { kind: 'empty', kb };
    }
    logResult(input.knowledgeBaseId, 'hits', hits.length, started);
    return { kind: 'hits', kb, hits };
  } catch (error) {
    throwIfAborted(input.signal);
    if (error instanceof RetrievalAbortedError) {
      throw error;
    }
    if (error instanceof RetrievalQueryError) {
      logResult(input.knowledgeBaseId, 'kb_missing', 0, started);
      return { kind: 'kb_missing', knowledgeBaseId: input.knowledgeBaseId };
    }
    logger.error('retrieve for chat failed', {
      knowledgeBaseId: input.knowledgeBaseId,
      kind: 'unavailable',
      error: error instanceof Error ? error.message : 'unknown',
      durationMs: Date.now() - started,
    });
    return { kind: 'unavailable', kb };
  }
}

function logResult(
  knowledgeBaseId: string,
  kind: RetrieveForChatResult['kind'],
  hitCount: number,
  started: number,
): void {
  logger.info('retrieve for chat', {
    knowledgeBaseId,
    kind,
    hitCount,
    durationMs: Date.now() - started,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RetrievalAbortedError();
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RetrievalUnavailableError('retrieval-timeout'));
    }, timeoutMs);
  });
  const abort = signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => {
          reject(new RetrievalAbortedError());
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      })
    : null;
  try {
    const racers = abort ? [promise, timeout, abort] : [promise, timeout];
    return await Promise.race(racers);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
