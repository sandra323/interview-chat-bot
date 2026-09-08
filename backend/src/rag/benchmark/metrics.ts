/**
 * 检索命中指标。空列表、无 gold、K<=0 返回 0，不抛。
 * 只评 chunk 是否命中，不评回答质量。
 */

export function recallAtK(
  rankedKeys: readonly string[],
  relevantKeys: readonly string[],
  k: number,
): number {
  if (!Number.isFinite(k) || k <= 0 || relevantKeys.length === 0) {
    return 0;
  }
  const relevant = unique(relevantKeys);
  if (relevant.length === 0) {
    return 0;
  }
  const top = new Set(rankedKeys.slice(0, Math.floor(k)));
  const hit = relevant.filter((key) => top.has(key)).length;
  return hit / relevant.length;
}

export function precisionAtK(
  rankedKeys: readonly string[],
  relevantKeys: readonly string[],
  k: number,
): number {
  if (!Number.isFinite(k) || k <= 0 || relevantKeys.length === 0) {
    return 0;
  }
  const limit = Math.floor(k);
  const relevant = new Set(unique(relevantKeys));
  const top = rankedKeys.slice(0, limit);
  if (top.length === 0) {
    return 0;
  }
  const hit = top.filter((key) => relevant.has(key)).length;
  return hit / limit;
}

/** 第一条相关结果的 1/rank；没有相关结果为 0。 */
export function reciprocalRank(
  rankedKeys: readonly string[],
  relevantKeys: readonly string[],
): number {
  if (relevantKeys.length === 0 || rankedKeys.length === 0) {
    return 0;
  }
  const relevant = new Set(unique(relevantKeys));
  const index = rankedKeys.findIndex((key) => relevant.has(key));
  if (index < 0) {
    return 0;
  }
  return 1 / (index + 1);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key) => key.length > 0))];
}
