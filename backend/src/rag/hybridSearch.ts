import { resolveKeywordTopK, resolveVectorTopK } from './chunkConfig.js';
import { searchByKeyword } from './keywordSearch.js';
import {
  assertKnowledgeBaseId,
  normalizeRetrievalQuery,
} from './retrievalQuery.js';
import { reciprocalRankFusion } from './rrf.js';
import type { KeywordHit, RankedHit, VectorHit } from './retrievalTypes.js';
import { RetrievalUnavailableError } from './retrievalErrors.js';
import { searchByVector } from './vectorSearch.js';
import { logger } from '../utils/logger.js';

export interface HybridSearchInput {
  ownerUsername: string;
  knowledgeBaseId: string;
  query: string;
  vectorK?: number;
  keywordK?: number;
  rrfK?: number;
  fusionTopN?: number;
}

export type HybridDegraded = 'vector' | 'keyword' | null;

/**
 * 向量 + 关键词并行粗召，再 RRF 融合。
 * 空 query 返回 [] 且不打 embedding；非法 UUID 在两路之前抛 RetrievalQueryError。
 * 单路失败则用另一路融合并打 degraded 日志；两路都抛则 RetrievalUnavailableError。
 * 两路都成功但 0 命中返回 []（空召回，由 Phase 7 处理）。
 */
export async function hybridSearch(
  input: HybridSearchInput,
): Promise<RankedHit[]> {
  const query = normalizeRetrievalQuery(input.query);
  if (!query) {
    return [];
  }
  assertKnowledgeBaseId(input.knowledgeBaseId);

  const vectorK = resolveVectorTopK(input.vectorK);
  const keywordK = resolveKeywordTopK(input.keywordK);

  const started = Date.now();
  const [vectorResult, keywordResult] = await Promise.allSettled([
    vectorK > 0
      ? searchByVector({
          ownerUsername: input.ownerUsername,
          knowledgeBaseId: input.knowledgeBaseId,
          query,
          k: vectorK,
        })
      : Promise.resolve([] as VectorHit[]),
    keywordK > 0
      ? searchByKeyword({
          ownerUsername: input.ownerUsername,
          knowledgeBaseId: input.knowledgeBaseId,
          query,
          k: keywordK,
        })
      : Promise.resolve([] as KeywordHit[]),
  ]);

  const vectorFailed = vectorResult.status === 'rejected';
  const keywordFailed = keywordResult.status === 'rejected';
  if (vectorFailed && keywordFailed) {
    throw new RetrievalUnavailableError(
      vectorResult.reason ?? keywordResult.reason,
    );
  }

  const vectorHits = vectorFailed ? [] : vectorResult.value;
  const keywordHits = keywordFailed ? [] : keywordResult.value;
  const degraded: HybridDegraded = vectorFailed
    ? 'vector'
    : keywordFailed
      ? 'keyword'
      : null;

  const hits = reciprocalRankFusion(vectorHits, keywordHits, {
    rrfK: input.rrfK,
    fusionTopN: input.fusionTopN,
  });

  logger.info('hybrid search', {
    knowledgeBaseId: input.knowledgeBaseId,
    hitCount: hits.length,
    vectorHits: vectorHits.length,
    keywordHits: keywordHits.length,
    degraded,
    durationMs: Date.now() - started,
  });
  return hits;
}
