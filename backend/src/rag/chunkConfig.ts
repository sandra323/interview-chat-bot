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

/** 缺省 20；k<=0 视为不检索；超过 VECTOR_MAX_K 则钳制。 */
export function resolveVectorTopK(k?: number): number {
  if (k === undefined) {
    return VECTOR_TOP_K;
  }
  if (!Number.isFinite(k) || k <= 0) {
    return 0;
  }
  return Math.min(Math.floor(k), VECTOR_MAX_K);
}

export const INGEST_PROGRESS = {
  started: 10,
  parsed: 30,
  chunked: 50,
  embedded: 80,
  ready: 100,
} as const;
