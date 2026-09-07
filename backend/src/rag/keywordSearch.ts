import { resolveKeywordTopK } from './chunkConfig.js';
import { searchKeyword } from './chunkStore.js';
import { tokenizeForFts } from './jiebaFts.js';
import {
  assertKnowledgeBaseId,
  normalizeRetrievalQuery,
} from './retrievalQuery.js';
import type { KeywordHit } from './retrievalTypes.js';
import { logger } from '../utils/logger.js';

export interface SearchByKeywordInput {
  ownerUsername: string;
  knowledgeBaseId: string;
  query: string;
  k?: number;
}

/**
 * 用 jieba 分词后的 query 做 FTS 粗召。
 * 空 query / 分词后无 lexeme / k<=0 返回 []，不访问 PG。
 * 非法 UUID 抛 RetrievalQueryError；PG 失败由 searchKeyword 转为 RetrievalUnavailableError。
 */
export async function searchByKeyword(
  input: SearchByKeywordInput,
): Promise<KeywordHit[]> {
  const query = normalizeRetrievalQuery(input.query);
  if (!query) {
    return [];
  }
  assertKnowledgeBaseId(input.knowledgeBaseId);

  const tokens = tokenizeForFts(query);
  if (!tokens) {
    return [];
  }

  const k = resolveKeywordTopK(input.k);
  if (k <= 0) {
    return [];
  }

  const started = Date.now();
  const hits = await searchKeyword({
    ownerUsername: input.ownerUsername,
    knowledgeBaseId: input.knowledgeBaseId,
    tokens,
    k,
  });
  logger.info('keyword search', {
    knowledgeBaseId: input.knowledgeBaseId,
    hitCount: hits.length,
    durationMs: Date.now() - started,
  });
  return hits;
}
