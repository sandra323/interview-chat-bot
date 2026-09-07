import { describe, expect, it } from 'vitest';
import { RRF_K } from '../chunkConfig.js';
import { reciprocalRankFusion } from '../rrf.js';
import type { ChunkHit } from '../retrievalTypes.js';

function hit(id: string, content = id): ChunkHit {
  return {
    id,
    documentId: 'doc',
    knowledgeBaseId: 'kb',
    ownerUsername: 'demo',
    content,
    chunkIndex: 0,
    metadata: {},
    embeddingModel: null,
  };
}

describe('reciprocalRankFusion', () => {
  it('returns empty when both lists are empty', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('keeps a single list ordered by rank', () => {
    const fused = reciprocalRankFusion([hit('a'), hit('b')], [], {
      fusionTopN: 10,
    });
    expect(fused.map((item) => item.id)).toEqual(['a', 'b']);
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / (RRF_K + 1));
    expect(fused[1]?.rrfScore).toBeCloseTo(1 / (RRF_K + 2));
    expect(fused[0]?.fromVector).toBe(true);
    expect(fused[0]?.fromKeyword).toBe(false);
    expect(fused[0]?.vectorRank).toBe(1);
  });

  it('adds scores for the same id and does not duplicate', () => {
    const shared = hit('shared', 'from-vector');
    const fused = reciprocalRankFusion(
      [shared],
      [hit('shared', 'from-keyword')],
      { fusionTopN: 10 },
    );
    expect(fused).toHaveLength(1);
    expect(fused[0]?.content).toBe('from-vector');
    expect(fused[0]?.fromVector).toBe(true);
    expect(fused[0]?.fromKeyword).toBe(true);
    expect(fused[0]?.rrfScore).toBeCloseTo(2 / (RRF_K + 1));
  });

  it('keeps vector-only, keyword-only, and shared hits', () => {
    const fused = reciprocalRankFusion(
      [hit('dog'), hit('shared')],
      [hit('flower'), hit('shared')],
      { fusionTopN: 10 },
    );
    const ids = fused.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['dog', 'flower', 'shared']));
    expect(fused.find((item) => item.id === 'shared')?.fromVector).toBe(true);
    expect(fused.find((item) => item.id === 'shared')?.fromKeyword).toBe(true);
    expect(fused.find((item) => item.id === 'dog')?.fromKeyword).toBe(false);
    expect(fused.find((item) => item.id === 'flower')?.fromVector).toBe(false);
  });

  it('breaks score ties by id for stable order', () => {
    const fused = reciprocalRankFusion([hit('b-id')], [hit('a-id')], {
      fusionTopN: 10,
    });
    expect(fused.map((item) => item.id)).toEqual(['a-id', 'b-id']);
  });

  it('truncates to fusionTopN', () => {
    const fused = reciprocalRankFusion(
      [hit('a'), hit('b'), hit('c')],
      [],
      { fusionTopN: 2 },
    );
    expect(fused.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('returns empty when fusionTopN is not positive', () => {
    expect(
      reciprocalRankFusion([hit('a')], [hit('b')], { fusionTopN: 0 }),
    ).toEqual([]);
  });
});
