/** 检索命中的公共字段。Phase 5 FTS / RRF 复用同一形状，数组顺序即 rank。 */
export interface ChunkHit {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  ownerUsername: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  embeddingModel: string | null;
}

/** 向量检索命中。distance 为 pgvector 余弦距离（越小越相似）。 */
export interface VectorHit extends ChunkHit {
  distance: number;
}

/** 关键词 FTS 命中。tsRank 为 Postgres ts_rank；RRF 只用数组位次。 */
export interface KeywordHit extends ChunkHit {
  tsRank: number;
}

/** RRF 融合命中。Phase 6/7 入口返回此形状；prompt 只用 ChunkHit 字段。 */
export interface RankedHit extends ChunkHit {
  rrfScore: number;
  fromVector: boolean;
  fromKeyword: boolean;
  vectorRank: number | null;
  keywordRank: number | null;
}
