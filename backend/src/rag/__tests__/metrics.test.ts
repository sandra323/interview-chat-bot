import { describe, expect, it } from 'vitest';
import { mean, precisionAtK, recallAtK, reciprocalRank } from '../benchmark/metrics.js';

describe('retrieval metrics', () => {
  const ranked = ['a', 'b', 'c', 'd'];

  it('scores a full hit', () => {
    expect(recallAtK(ranked, ['a'], 5)).toBe(1);
    expect(precisionAtK(ranked, ['a'], 5)).toBe(1 / 5);
    expect(reciprocalRank(ranked, ['a'])).toBe(1);
  });

  it('scores a miss as zero', () => {
    expect(recallAtK(ranked, ['z'], 5)).toBe(0);
    expect(precisionAtK(ranked, ['z'], 5)).toBe(0);
    expect(reciprocalRank(ranked, ['z'])).toBe(0);
  });

  it('scores a partial hit and uses the first relevant rank', () => {
    expect(recallAtK(ranked, ['b', 'z'], 2)).toBe(0.5);
    expect(precisionAtK(ranked, ['b', 'c'], 2)).toBe(0.5);
    expect(reciprocalRank(ranked, ['c'])).toBe(1 / 3);
  });

  it('returns 0 for empty gold, empty ranking, or k <= 0', () => {
    expect(recallAtK(ranked, [], 5)).toBe(0);
    expect(precisionAtK([], ['a'], 5)).toBe(0);
    expect(recallAtK(ranked, ['a'], 0)).toBe(0);
    expect(precisionAtK(ranked, ['a'], -1)).toBe(0);
    expect(reciprocalRank([], ['a'])).toBe(0);
  });

  it('caps k larger than the ranked list', () => {
    expect(recallAtK(['a'], ['a'], 12)).toBe(1);
    expect(precisionAtK(['a'], ['a'], 5)).toBe(1 / 5);
  });

  it('averages only the provided values', () => {
    expect(mean([])).toBe(0);
    expect(mean([0, 1])).toBe(0.5);
  });
});
