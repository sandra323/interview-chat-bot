import { EMBED_MAX_INPUT_CHARS } from './chunkConfig.js';
import { logger } from '../utils/logger.js';
import { RetrievalQueryError } from './retrievalErrors.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 去空白；超长截断到 embedding / FTS 共用安全上限。
 * 空字符串表示不应检索，调用方应直接返回 []。
 */
export function normalizeRetrievalQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= EMBED_MAX_INPUT_CHARS) {
    return trimmed;
  }
  logger.warn('retrieval query truncated', {
    originalLength: trimmed.length,
    maxChars: EMBED_MAX_INPUT_CHARS,
  });
  return trimmed.slice(0, EMBED_MAX_INPUT_CHARS);
}

/** 非法 knowledgeBaseId 抛 RetrievalQueryError，避免一路空一路抛。 */
export function assertKnowledgeBaseId(knowledgeBaseId: string): void {
  if (!UUID_RE.test(knowledgeBaseId)) {
    throw new RetrievalQueryError('knowledgeBaseId must be a UUID');
  }
}
