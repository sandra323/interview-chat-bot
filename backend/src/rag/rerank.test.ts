import { afterEach, describe, expect, it } from 'vitest';
import { EMBED_MAX_INPUT_CHARS } from './chunkConfig.js';
import {
  isVoyageRerankConfigured,
  orderHitsByRerank,
  requestVoyageRerank,
  resetRerankRequesterForTests,
  setRerankRequesterForTests,
} from './rerank.js';
import {
  RerankConfigError,
  RerankQuotaError,
  RerankResponseError,
  RerankUnavailableError,
} from './rerankErrors.js';

afterEach(() => {
  resetRerankRequesterForTests();
});

function hit(id: string): { id: string } {
  return { id };
}

describe('orderHitsByRerank', () => {
  it('reorders by relevanceScore descending', () => {
    const ordered = orderHitsByRerank(
      [hit('a'), hit('b'), hit('c')],
      [
        { index: 0, relevanceScore: 0.1 },
        { index: 1, relevanceScore: 0.9 },
        { index: 2, relevanceScore: 0.5 },
      ],
    );
    expect(ordered.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps original index order on tied scores', () => {
    const ordered = orderHitsByRerank(
      [hit('first'), hit('second')],
      [
        { index: 0, relevanceScore: 0.4 },
        { index: 1, relevanceScore: 0.4 },
      ],
    );
    expect(ordered.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('returns the same object references', () => {
    const items = [hit('a'), hit('b')];
    const ordered = orderHitsByRerank(items, [
      { index: 1, relevanceScore: 1 },
      { index: 0, relevanceScore: 0 },
    ]);
    expect(ordered[0]).toBe(items[1]);
    expect(ordered[1]).toBe(items[0]);
  });

  it('rejects missing, duplicate, or out-of-range indexes', () => {
    expect(() => orderHitsByRerank([hit('a')], [])).toThrow(RerankResponseError);
    expect(() =>
      orderHitsByRerank([hit('a'), hit('b')], [
        { index: 0, relevanceScore: 1 },
        { index: 0, relevanceScore: 0.5 },
      ]),
    ).toThrow(/duplicate/);
    expect(() =>
      orderHitsByRerank([hit('a')], [{ index: 3, relevanceScore: 1 }]),
    ).toThrow(/range/);
    expect(() =>
      orderHitsByRerank([hit('a')], [{ index: 0, relevanceScore: Number.NaN }]),
    ).toThrow(/finite/);
  });

  it('returns empty when both inputs are empty', () => {
    expect(orderHitsByRerank([], [])).toEqual([]);
  });
});

describe('isVoyageRerankConfigured', () => {
  const keys = ['VOYAGE_API_KEY', 'VOYAGE_RERANK_URL', 'NODE_ENV'] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('is false without a key and when production URL is not https', () => {
    for (const key of keys) {
      saved[key] = process.env[key];
    }
    delete process.env.VOYAGE_API_KEY;
    expect(isVoyageRerankConfigured()).toBe(false);

    process.env.VOYAGE_API_KEY = 'vk';
    process.env.NODE_ENV = 'production';
    process.env.VOYAGE_RERANK_URL = 'http://localhost/rerank';
    expect(isVoyageRerankConfigured()).toBe(false);

    process.env.VOYAGE_RERANK_URL = 'https://api.voyageai.com/v1/rerank';
    expect(isVoyageRerankConfigured()).toBe(true);
  });
});

describe('requestVoyageRerank', () => {
  it('returns [] for empty documents without calling the requester', async () => {
    let called = false;
    setRerankRequesterForTests(async () => {
      called = true;
      return [];
    });
    await expect(
      requestVoyageRerank({ query: '赏花', documents: [] }),
    ).resolves.toEqual([]);
    expect(called).toBe(false);
  });

  it('throws RerankConfigError when no key and no override', async () => {
    const prev = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    try {
      await expect(
        requestVoyageRerank({ query: '赏花', documents: ['春季赏花'] }),
      ).rejects.toBeInstanceOf(RerankConfigError);
    } finally {
      if (prev === undefined) {
        delete process.env.VOYAGE_API_KEY;
      } else {
        process.env.VOYAGE_API_KEY = prev;
      }
    }
  });

  it('truncates overlong documents before calling the requester', async () => {
    setRerankRequesterForTests(async (input) => {
      expect(input.documents).toHaveLength(1);
      expect(input.documents[0]).toHaveLength(EMBED_MAX_INPUT_CHARS);
      return [{ index: 0, relevanceScore: 1 }];
    });
    await requestVoyageRerank({
      query: 'q',
      documents: ['汉'.repeat(EMBED_MAX_INPUT_CHARS + 40)],
    });
  });

  it('returns injected scores and sends truncation via override payload', async () => {
    setRerankRequesterForTests(async (input) => {
      expect(input.documents).toEqual(['doc-a', 'doc-b']);
      expect(input.topK).toBe(2);
      return [
        { index: 1, relevanceScore: 0.9 },
        { index: 0, relevanceScore: 0.1 },
      ];
    });
    const scores = await requestVoyageRerank({
      query: '赏花',
      documents: ['doc-a', 'doc-b'],
      topK: 2,
    });
    expect(scores[0]?.index).toBe(1);
  });

  it('retries 429 then succeeds', async () => {
    let attempts = 0;
    setRerankRequesterForTests(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error('rate'), { status: 429 });
      }
      return [{ index: 0, relevanceScore: 1 }];
    });
    const scores = await requestVoyageRerank({
      query: 'q',
      documents: ['d'],
    });
    expect(attempts).toBe(3);
    expect(scores).toHaveLength(1);
  });

  it('does not retry config errors', async () => {
    let attempts = 0;
    setRerankRequesterForTests(async () => {
      attempts += 1;
      throw new RerankConfigError('rerank-unauthorized');
    });
    await expect(
      requestVoyageRerank({ query: 'q', documents: ['d'] }),
    ).rejects.toBeInstanceOf(RerankConfigError);
    expect(attempts).toBe(1);
  });

  it('maps quota errors without retry', async () => {
    let attempts = 0;
    setRerankRequesterForTests(async () => {
      attempts += 1;
      throw new RerankQuotaError();
    });
    await expect(
      requestVoyageRerank({ query: 'q', documents: ['d'] }),
    ).rejects.toBeInstanceOf(RerankQuotaError);
    expect(attempts).toBe(1);
  });

  it('maps timeout to unavailable after retries', async () => {
    setRerankRequesterForTests(async () => {
      throw new Error('Request timed out');
    });
    await expect(
      requestVoyageRerank({ query: 'q', documents: ['d'] }),
    ).rejects.toBeInstanceOf(RerankUnavailableError);
  });

  it('rejects a malformed injected payload via orderHitsByRerank', async () => {
    setRerankRequesterForTests(async () => []);
    const scores = await requestVoyageRerank({
      query: 'q',
      documents: ['d'],
    });
    expect(() => orderHitsByRerank([{ id: 'd' }], scores)).toThrow(
      RerankResponseError,
    );
  });
});

describe('fetchVoyageRerank HTTP mapping', () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.VOYAGE_API_KEY;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.VOYAGE_API_KEY;
    } else {
      process.env.VOYAGE_API_KEY = previousKey;
    }
  });

  function stubFetch(status: number, body: string): void {
    process.env.VOYAGE_API_KEY = 'vk-test';
    globalThis.fetch = (async () =>
      new Response(body, {
        status,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
  }

  it('maps 401 to RerankConfigError', async () => {
    stubFetch(401, 'unauthorized');
    await expect(
      requestVoyageRerank({ query: 'q', documents: ['d'] }),
    ).rejects.toBeInstanceOf(RerankConfigError);
  });

  it('maps 402 to RerankQuotaError', async () => {
    stubFetch(402, 'insufficient_quota');
    await expect(
      requestVoyageRerank({ query: 'q', documents: ['d'] }),
    ).rejects.toBeInstanceOf(RerankQuotaError);
  });

  it('maps empty data to RerankResponseError', async () => {
    stubFetch(200, JSON.stringify({ data: [] }));
    await expect(
      requestVoyageRerank({ query: 'q', documents: ['d'] }),
    ).rejects.toBeInstanceOf(RerankResponseError);
  });
});
