export type BenchmarkTag = 'exact' | 'weak' | 'cross' | 'mixed';

/** 评测 query。anchors 在切分后绑定成 chunk key，不要预先写死 UUID。 */
export interface BenchmarkQuery {
  id: string;
  query: string;
  anchors: string[];
  tags: BenchmarkTag[];
}

export interface QueryScore {
  id: string;
  tags: BenchmarkTag[];
  status: 'ok' | 'invalid-gold' | 'error';
  relevantCount: number;
  rank: number | null;
  recallAt5: number;
  recallAt12: number;
  precisionAt5: number;
  mrr: number;
  error?: string;
}

export interface BenchmarkReport {
  mode: 'offline' | 'live';
  knowledgeBaseId: string;
  queryCount: number;
  scoredCount: number;
  invalidGold: number;
  errors: number;
  degraded: number;
  recallAt5: number;
  recallAt12: number;
  precisionAt5: number;
  mrr: number;
  weakInTop5: number;
  weakTotal: number;
  queries: QueryScore[];
}
