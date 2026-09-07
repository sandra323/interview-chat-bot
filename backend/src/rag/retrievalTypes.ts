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
