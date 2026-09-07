import { describe, expect, it } from 'vitest';
import {
  EMBED_DIM,
  KEYWORD_MAX_K,
  KEYWORD_TOP_K,
  RRF_FUSION_MAX_N,
  RRF_FUSION_TOP_N,
  VECTOR_MAX_K,
  VECTOR_TOP_K,
  resolveClampedK,
  resolveFusionTopN,
  resolveKeywordTopK,
  resolveVectorTopK,
} from './chunkConfig.js';
import {
  assertFiniteVector,
  formatVector,
  isFiniteVector,
} from './pgvectorFormat.js';

describe('pgvectorFormat', () => {
  it('formats a vector as a pgvector literal', () => {
    expect(formatVector([1, 0.5, -2])).toBe('[1,0.5,-2]');
  });

  it('accepts a finite embedding of the expected dimension', () => {
    const embedding = new Array<number>(EMBED_DIM).fill(0.1);
    expect(isFiniteVector(embedding)).toBe(true);
    expect(() => assertFiniteVector(embedding)).not.toThrow();
  });

  it('rejects wrong dimension, NaN, and Infinity', () => {
    expect(isFiniteVector([0, 1])).toBe(false);
    expect(() => assertFiniteVector([0, 1])).toThrow(/dim/);

    const withNaN = new Array<number>(EMBED_DIM).fill(0);
    withNaN[0] = Number.NaN;
    expect(isFiniteVector(withNaN)).toBe(false);
    expect(() => assertFiniteVector(withNaN)).toThrow(/finite/);

    const withInf = new Array<number>(EMBED_DIM).fill(0);
    withInf[1] = Number.POSITIVE_INFINITY;
    expect(isFiniteVector(withInf)).toBe(false);
  });
});

describe('resolveClampedK', () => {
  it('defaults, rejects non-positive, and clamps to max', () => {
    expect(resolveClampedK(undefined, 20, 100)).toBe(20);
    expect(resolveClampedK(0, 20, 100)).toBe(0);
    expect(resolveClampedK(-3, 20, 100)).toBe(0);
    expect(resolveClampedK(Number.NaN, 20, 100)).toBe(0);
    expect(resolveClampedK(3.9, 20, 100)).toBe(3);
    expect(resolveClampedK(150, 20, 100)).toBe(100);
  });
});

describe('resolveVectorTopK', () => {
  it('defaults to VECTOR_TOP_K and clamps to VECTOR_MAX_K', () => {
    expect(resolveVectorTopK()).toBe(VECTOR_TOP_K);
    expect(resolveVectorTopK(0)).toBe(0);
    expect(resolveVectorTopK(-3)).toBe(0);
    expect(resolveVectorTopK(Number.NaN)).toBe(0);
    expect(resolveVectorTopK(3.9)).toBe(3);
    expect(resolveVectorTopK(VECTOR_MAX_K + 50)).toBe(VECTOR_MAX_K);
  });
});

describe('resolveKeywordTopK / resolveFusionTopN', () => {
  it('uses keyword and fusion experimental defaults', () => {
    expect(resolveKeywordTopK()).toBe(KEYWORD_TOP_K);
    expect(resolveKeywordTopK(KEYWORD_MAX_K + 1)).toBe(KEYWORD_MAX_K);
    expect(resolveFusionTopN()).toBe(RRF_FUSION_TOP_N);
    expect(resolveFusionTopN(RRF_FUSION_MAX_N + 1)).toBe(RRF_FUSION_MAX_N);
    expect(resolveFusionTopN(0)).toBe(0);
  });
});
