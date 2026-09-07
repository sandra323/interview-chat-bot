/** 初始实验参数，Phase 9 Retrieval Benchmark 再调。 */

export const CHUNK_SIZE = 700;
export const CHUNK_OVERLAP = 100;

/** OpenAI text-embedding-3-small 维度 */
export const EMBED_DIM = 1536;

export const EMBED_BATCH_SIZE = 64;
export const EMBED_MAX_RETRIES = 3;
export const EMBED_TIMEOUT_MS = 60_000;

/**
 * 单条输入安全上限（汉字）。
 * text-embedding-3-small 约 8191 token；中文按约 1.5 字/token 取保守值。
 */
export const EMBED_MAX_INPUT_CHARS = 4000;

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_EMBEDDING_MODEL_VERSION =
  'text-embedding-3-small@2024-01-25';

/** 向量粗召 Top-K。Phase 9 Retrieval Benchmark 再调。 */
export const VECTOR_TOP_K = 20;
/** 防止误传超大 k 扫全表 */
export const VECTOR_MAX_K = 100;

/** 关键词 FTS Top-K。Phase 9 Retrieval Benchmark 再调。 */
export const KEYWORD_TOP_K = 20;
export const KEYWORD_MAX_K = 100;

/** RRF 常数 k。Phase 9 Retrieval Benchmark 再调。 */
export const RRF_K = 60;
/** RRF 融合后送入 rerank / 上下文的条数。Phase 9 再调。 */
export const RRF_FUSION_TOP_N = 12;
export const RRF_FUSION_MAX_N = 100;

/** Voyage 精排后注入 context 的条数。Phase 9 再调。 */
export const RERANK_TOP_N = 5;
export const RERANK_MAX_N = 20;
export const RERANK_TIMEOUT_MS = 15_000;
export const RERANK_MAX_RETRIES = 3;

export const DEFAULT_VOYAGE_RERANK_MODEL = 'rerank-2-lite';
export const DEFAULT_VOYAGE_RERANK_URL = 'https://api.voyageai.com/v1/rerank';

/** 启动时回填空 fts_tokens 的每批行数。 */
export const FTS_BACKFILL_BATCH = 100;

/**
 * 缺省 defaultK；k<=0 视为不检索；超过 maxK 则钳制。
 * 向量 / 关键词 / fusionTopN 共用，避免复制钳制逻辑。
 */
export function resolveClampedK(
  k: number | undefined,
  defaultK: number,
  maxK: number,
): number {
  if (k === undefined) {
    return defaultK;
  }
  if (!Number.isFinite(k) || k <= 0) {
    return 0;
  }
  return Math.min(Math.floor(k), maxK);
}

/** 缺省 20；k<=0 视为不检索；超过 VECTOR_MAX_K 则钳制。 */
export function resolveVectorTopK(k?: number): number {
  return resolveClampedK(k, VECTOR_TOP_K, VECTOR_MAX_K);
}

export function resolveKeywordTopK(k?: number): number {
  return resolveClampedK(k, KEYWORD_TOP_K, KEYWORD_MAX_K);
}

export function resolveFusionTopN(n?: number): number {
  return resolveClampedK(n, RRF_FUSION_TOP_N, RRF_FUSION_MAX_N);
}

export function resolveRerankTopN(n?: number): number {
  return resolveClampedK(n, RERANK_TOP_N, RERANK_MAX_N);
}

/** Chat 检索整体超时（含 hybrid + 可选 rerank）。超时视为检索不可用。 */
export const RETRIEVAL_TIMEOUT_MS = 20_000;

/** 注入模型的摘录总字数上限，避免撑爆上下文。 */
export const RAG_EXCERPT_MAX_CHARS = 8000;

export const INGEST_PROGRESS = {
  started: 10,
  parsed: 30,
  chunked: 50,
  embedded: 80,
  ready: 100,
} as const;
