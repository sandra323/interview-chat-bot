import { describe, expect, it } from 'vitest';
import { BENCH_QUERIES } from '../benchmark/fixtures.js';
import { bindRelevantKeys } from '../benchmark/gold.js';

describe('benchmark gold binding', () => {
  it('binds keys only after a chunk actually contains the anchor', () => {
    const query = BENCH_QUERIES.find((item) => item.id === 'q01');
    expect(query).toBeDefined();
    const keys = bindRelevantKeys(query!, [
      {
        slug: 'park',
        anchor: 'flower-spring',
        content: '春季赏花\n«flower-spring»',
      },
      {
        slug: 'park',
        anchor: 'flower-ticket',
        content: '门票\n«flower-ticket»',
      },
    ]);
    expect(keys).toEqual(['park:flower-spring']);
  });

  it('returns no keys when the anchor is missing from stored chunks', () => {
    const query = BENCH_QUERIES.find((item) => item.id === 'q15');
    expect(query?.tags).toContain('weak');
    expect(
      bindRelevantKeys(query!, [
        { slug: 'pets', anchor: 'dog-golden', content: '没有锚点' },
      ]),
    ).toEqual([]);
  });

  it('keeps at least four weak queries', () => {
    expect(BENCH_QUERIES.filter((query) => query.tags.includes('weak'))).toHaveLength(
      4,
    );
    expect(BENCH_QUERIES.length).toBeGreaterThanOrEqual(20);
  });
});
