import { resolveVectorTopK } from './chunkConfig.js';
import { embeddingModelInfo, embedTexts } from './embedder.js';
import { searchVector } from './chunkStore.js';
import { logger } from '../utils/logger.js';
import {
  assertKnowledgeBaseId,
  normalizeRetrievalQuery,
} from './retrievalQuery.js';
import type { VectorHit } from './retrievalTypes.js';

export {
  assertKnowledgeBaseId,
  normalizeRetrievalQuery as normalizeQueryForEmbed,
} from './retrievalQuery.js';

export interface SearchByVectorInput {
  ownerUsername: string;
  knowledgeBaseId: string;
  query: string;
  k?: number;
}

/**
 * 用 query 文本做向量粗召。空 query / k<=0 返回 []，不打 embedding。
 * embed 失败原样抛出 Embed* 错误；PG 失败由 searchVector 转为 RetrievalUnavailableError。
 */
export async function searchByVector(
  input: SearchByVectorInput,
): Promise<VectorHit[]> {
  const query = normalizeRetrievalQuery(input.query);
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
