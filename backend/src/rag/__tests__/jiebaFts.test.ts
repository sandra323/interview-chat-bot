import { afterEach, describe, expect, it } from 'vitest';
import { EMBED_MAX_INPUT_CHARS } from '../chunkConfig.js';
import {
  fallbackCut,
  resetTokenizerForTests,
  setTokenizerForTests,
  tokenizeForFts,
} from '../jiebaFts.js';
import { normalizeRetrievalQuery } from '../retrievalQuery.js';

afterEach(() => {
  resetTokenizerForTests();
});

describe('tokenizeForFts', () => {
  it('returns empty for blank or punctuation-only input', () => {
    expect(tokenizeForFts('')).toBe('');
    expect(tokenizeForFts('   ')).toBe('');
    expect(tokenizeForFts('!!!')).toBe('');
    expect(tokenizeForFts('，。、')).toBe('');
  });

  it('tokenizes Chinese and lowercases English', () => {
    const chinese = tokenizeForFts('春季赏花攻略');
    expect(chinese.length).toBeGreaterThan(0);
    expect(chinese).toContain('赏花');

    const english = tokenizeForFts('Hello World');
    expect(english).toContain('hello');
    expect(english).toContain('world');
    expect(english).not.toMatch(/Hello/);
  });

  it('keeps mixed Chinese, identifiers, and error codes', () => {
    const mixed = tokenizeForFts('React useEffect 闭包 ERR-9921');
    expect(mixed.toLowerCase()).toContain('useeffect');
    expect(mixed).toMatch(/9921/);
    expect(mixed).toContain('闭');
  });

  it('does not throw on tsquery special characters', () => {
    expect(() => tokenizeForFts('a & b | c ! (d): e')).not.toThrow();
    expect(typeof tokenizeForFts('a & b | c ! (d): e')).toBe('string');
  });

  it('tokenizes after shared query truncation', () => {
    const long = `赏花${'汉'.repeat(EMBED_MAX_INPUT_CHARS)}`;
    const truncated = normalizeRetrievalQuery(long);
    expect(truncated).toHaveLength(EMBED_MAX_INPUT_CHARS);
    const tokens = tokenizeForFts(truncated);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('returns empty when the tokenizer throws', () => {
    setTokenizerForTests(() => {
      throw new Error('boom');
    });
    expect(tokenizeForFts('春季赏花')).toBe('');
  });
});

describe('fallbackCut', () => {
  it('emits Chinese bigrams and latin tokens', () => {
    expect(fallbackCut('赏花')).toEqual(['赏花']);
    expect(fallbackCut('春季赏花')).toEqual(['春季', '季赏', '赏花']);
    expect(fallbackCut('Hello 赏花 World')).toEqual(['hello', '赏花', 'world']);
  });

  it('can be injected as the tokenizer', () => {
    setTokenizerForTests(fallbackCut);
    const tokens = tokenizeForFts('春季赏花攻略');
    expect(tokens.split(' ')).toEqual(fallbackCut('春季赏花攻略'));
    expect(tokens).toContain('赏花');
  });
});
