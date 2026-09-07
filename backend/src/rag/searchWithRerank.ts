import {
  EMBED_MAX_INPUT_CHARS,
  resolveRerankTopN,
} from './chunkConfig.js';
import { hybridSearch, type HybridSearchInput } from './hybridSearch.js';
import {
  isVoyageRerankConfigured,
  orderHitsByRerank,
  requestVoyageRerank,
  voyageRerankModel,
  type VoyageRerankResult,
} from './rerank.js';
import {
  RerankConfigError,
  RerankQuotaError,
  RerankResponseError,
  RerankUnavailableError,
} from './rerankErrors.js';
import { normalizeRetrievalQuery } from './retrievalQuery.js';
import type { RankedHit, RerankedHit } from './retrievalTypes.js';
import { logger } from '../utils/logger.js';

export interface SearchWithRerankInput extends HybridSearchInput {
  rerankTopN?: number;
}

export type RerankDegradedReason =
  | 'not_configured'
  | 'single_hit'
  | 'unavailable'
  | 'response'
  | 'quota'
  | null;

/**
 * Phase 7 的唯一检索入口：hybrid 粗召后再可选 Voyage 精排。
 * Rerank* 错误一律 fail-open 为 RRF Top N，不转化为 RetrievalUnavailableError。
 * hybrid 的 RetrievalQueryError / RetrievalUnavailableError 原样抛出。
 */
export async function searchWithRerank(
  input: SearchWithRerankInput,
): Promise<RerankedHit[]> {
  const topN = resolveRerankTopN(input.rerankTopN);
  if (topN <= 0) {
    return [];
  }

  const hits = await hybridSearch(input);
  if (hits.length === 0) {
    return [];
  }

  const started = Date.now();
  if (hits.length === 1 || !isVoyageRerankConfigured()) {
    const reason: RerankDegradedReason = hits.length === 1
      ? 'single_hit'
      : 'not_configured';
    const sliced = asUnreranked(hits, topN);
    logger.info('hybrid search with rerank', {
      knowledgeBaseId: input.knowledgeBaseId,
      candidateCount: hits.length,
      hitCount: sliced.length,
      model: voyageRerankModel(),
      degraded: 'rerank',
      reason,
      durationMs: Date.now() - started,
    });
    return sliced;
  }

  try {
    const query = normalizeRetrievalQuery(input.query);
    const documents = hits.map((hit) =>
      hit.content.length <= EMBED_MAX_INPUT_CHARS
        ? hit.content
        : hit.content.slice(0, EMBED_MAX_INPUT_CHARS),
    );
    const scores = await requestVoyageRerank({
      query,
      documents,
      topK: hits.length,
    });
    const ordered = orderHitsByRerank(hits, scores);
    const reranked = attachScores(ordered, hits, scores).slice(0, topN);
    logger.info('hybrid search with rerank', {
      knowledgeBaseId: input.knowledgeBaseId,
      candidateCount: hits.length,
      hitCount: reranked.length,
      model: voyageRerankModel(),
      degraded: null,
      reason: null,
      topScore: reranked[0]?.relevanceScore,
      durationMs: Date.now() - started,
    });
    return reranked;
  } catch (error) {
    const reason = degradedReason(error);
    logger.warn('rerank degraded', {
      knowledgeBaseId: input.knowledgeBaseId,
      candidateCount: hits.length,
      reason,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return asUnreranked(hits, topN);
  }
}

function asUnreranked(hits: RankedHit[], topN: number): RerankedHit[] {
  return hits.slice(0, topN).map((hit) => ({
    ...hit,
    relevanceScore: null,
    reranked: false,
  }));
}

function attachScores(
  ordered: RankedHit[],
  original: RankedHit[],
  scores: VoyageRerankResult[],
): RerankedHit[] {
  const indexById = new Map(original.map((hit, index) => [hit.id, index]));
  const scoreByIndex = new Map(
    scores.map((row) => [row.index, row.relevanceScore]),
  );
  return ordered.map((hit) => ({
    ...hit,
    relevanceScore: scoreByIndex.get(indexById.get(hit.id) ?? -1) ?? null,
    reranked: true,
  }));
}

function degradedReason(error: unknown): RerankDegradedReason {
  if (error instanceof RerankConfigError) {
    return 'not_configured';
  }
  if (error instanceof RerankQuotaError) {
    return 'quota';
  }
  if (error instanceof RerankResponseError) {
    return 'response';
  }
  if (error instanceof RerankUnavailableError) {
    return 'unavailable';
  }
  return 'unavailable';
}
