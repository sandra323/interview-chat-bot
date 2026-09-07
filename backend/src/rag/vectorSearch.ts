import { EMBED_MAX_INPUT_CHARS, resolveVectorTopK } from './chunkConfig.js';
import { embeddingModelInfo, embedTexts } from './embedder.js';
import { searchVector } from './chunkStore.js';
import { logger } from '../utils/logger.js';
import { RetrievalQueryError } from './retrievalErrors.js';
import type { VectorHit } from './retrievalTypes.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SearchByVectorInput {
  ownerUsername: string;
  knowledgeBaseId: string;
  query: string;
  k?: number;
}

/** 去空白；超长截断到 embedding 安全上限。空字符串表示不应检索。 */
export function normalizeQueryForEmbed(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= EMBED_MAX_INPUT_CHARS) {
    return trimmed;
  }
  logger.warn('vector search query truncated', {
    originalLength: trimmed.length,
    maxChars: EMBED_MAX_INPUT_CHARS,
  });
  return trimmed.slice(0, EMBED_MAX_INPUT_CHARS);
}

export function assertKnowledgeBaseId(knowledgeBaseId: string): void {
  if (!UUID_RE.test(knowledgeBaseId)) {
    throw new RetrievalQueryError('knowledgeBaseId must be a UUID');
  }
}

/**
 * 用 query 文本做向量粗召。空 query / k<=0 返回 []，不打 embedding。
 * embed 失败原样抛出 Embed* 错误；PG 失败由 searchVector 转为 RetrievalUnavailableError。
 */
export async function searchByVector(
  input: SearchByVectorInput,
): Promise<VectorHit[]> {
  const query = normalizeQueryForEmbed(input.query);
  if (!query) {
    return [];
  }
  assertKnowledgeBaseId(input.knowledgeBaseId);

  const k = resolveVectorTopK(input.k);
  if (k <= 0) {
    return [];
  }

  const started = Date.now();
  const [embedding] = await embedTexts([query]);
  if (!embedding) {
    return [];
  }

  const hits = await searchVector({
    ownerUsername: input.ownerUsername,
    knowledgeBaseId: input.knowledgeBaseId,
    embedding,
    k,
    embeddingModel: embeddingModelInfo().model,
  });

  logger.info('vector search', {
    knowledgeBaseId: input.knowledgeBaseId,
    hitCount: hits.length,
    topDistance: hits[0]?.distance,
    durationMs: Date.now() - started,
  });
  return hits;
}
