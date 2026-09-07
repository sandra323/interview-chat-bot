import { RRF_K, resolveFusionTopN } from './chunkConfig.js';
import type { ChunkHit, RankedHit } from './retrievalTypes.js';

export interface RrfOptions {
  rrfK?: number;
  fusionTopN?: number;
}

function toRankedHit(
  hit: ChunkHit,
  source: 'vector' | 'keyword',
  rank: number,
  score: number,
): RankedHit {
  return {
    id: hit.id,
    documentId: hit.documentId,
    knowledgeBaseId: hit.knowledgeBaseId,
    ownerUsername: hit.ownerUsername,
    content: hit.content,
    chunkIndex: hit.chunkIndex,
    metadata: hit.metadata,
    embeddingModel: hit.embeddingModel,
    rrfScore: score,
    fromVector: source === 'vector',
    fromKeyword: source === 'keyword',
    vectorRank: source === 'vector' ? rank : null,
    keywordRank: source === 'keyword' ? rank : null,
  };
}

function addList(
  merged: Map<string, RankedHit>,
  hits: ChunkHit[],
  source: 'vector' | 'keyword',
  rrfK: number,
): void {
  hits.forEach((hit, index) => {
    const rank = index + 1;
    const addScore = 1 / (rrfK + rank);
    const existing = merged.get(hit.id);
    if (!existing) {
      merged.set(hit.id, toRankedHit(hit, source, rank, addScore));
      return;
    }
    existing.rrfScore += addScore;
    if (source === 'vector') {
      existing.fromVector = true;
      existing.vectorRank = rank;
      existing.documentId = hit.documentId;
      existing.knowledgeBaseId = hit.knowledgeBaseId;
      existing.ownerUsername = hit.ownerUsername;
      existing.content = hit.content;
      existing.chunkIndex = hit.chunkIndex;
      existing.metadata = hit.metadata;
      existing.embeddingModel = hit.embeddingModel;
    } else {
      existing.fromKeyword = true;
      existing.keywordRank = rank;
    }
  });
}

/**
 * Reciprocal Rank Fusion：按列表位次计分，不看 cosine / ts_rank 绝对值。
 * 同一 chunk.id 去重后分数相加；正文以向量路副本为准；并列按 id 升序稳定排序。
 * fusionTopN<=0 返回 []。
 */
export function reciprocalRankFusion(
  vectorHits: ChunkHit[],
  keywordHits: ChunkHit[],
  options: RrfOptions = {},
): RankedHit[] {
  const topN = resolveFusionTopN(options.fusionTopN);
  if (topN <= 0) {
    return [];
  }
  const rrfK =
    options.rrfK !== undefined && Number.isFinite(options.rrfK) && options.rrfK > 0
      ? options.rrfK
      : RRF_K;

  const merged = new Map<string, RankedHit>();
  addList(merged, vectorHits, 'vector', rrfK);
  addList(merged, keywordHits, 'keyword', rrfK);

  return [...merged.values()]
    .sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) {
        return b.rrfScore - a.rrfScore;
      }
      return a.id.localeCompare(b.id);
    })
    .slice(0, topN);
}
