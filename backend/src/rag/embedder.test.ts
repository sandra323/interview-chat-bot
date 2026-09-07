import { afterEach, describe, expect, it } from 'vitest';
import { EMBED_BATCH_SIZE, EMBED_DIM } from './chunkConfig.js';
import {
  createDeterministicEmbedding,
  embedTexts,
  embedTextsWithRequester,
  resetEmbedderForTests,
  setEmbedderForTests,
  setEmbeddingsRequesterForTests,
} from './embedder.js';
import {
  EmbedConfigError,
  EmbedResponseError,
  EmbedUnavailableError,
} from './ingestErrors.js';

afterEach(() => {
  resetEmbedderForTests();
});

describe('embedTextsWithRequester', () => {
  it('batches inputs', async () => {
    const calls: number[] = [];
    const texts = Array.from({ length: EMBED_BATCH_SIZE + 3 }, (_, i) => `t${i}`);
    const vectors = await embedTextsWithRequester(texts, async (batch) => {
      calls.push(batch.length);
      return batch.map((text) => createDeterministicEmbedding(text));
    });
    expect(calls).toEqual([EMBED_BATCH_SIZE, 3]);
    expect(vectors).toHaveLength(texts.length);
    expect(vectors[0]).toHaveLength(EMBED_DIM);
  });

  it('retries 429 then succeeds', async () => {
    let attempts = 0;
    const vectors = await embedTextsWithRequester(['hello'], async (batch) => {
      attempts += 1;
      if (attempts < 2) {
        const error = Object.assign(new Error('rate'), { status: 429 });
        throw error;
      }
      return batch.map((text) => createDeterministicEmbedding(text));
    });
    expect(attempts).toBe(2);
    expect(vectors).toHaveLength(1);
  });

  it('maps timeout to unavailable after retries', async () => {
    await expect(
      embedTextsWithRequester(['hello'], async () => {
        throw new Error('Request timed out');
      }),
    ).rejects.toBeInstanceOf(EmbedUnavailableError);
  });

  it('rejects wrong vector count', async () => {
    await expect(
      embedTextsWithRequester(['a', 'b'], async () => [
        createDeterministicEmbedding('a'),
      ]),
    ).rejects.toBeInstanceOf(EmbedResponseError);
  });

  it('rejects wrong dimension', async () => {
    await expect(
      embedTextsWithRequester(['a'], async () => [[0.1, 0.2]]),
    ).rejects.toBeInstanceOf(EmbedResponseError);
  });
});

describe('embedTexts OpenAI path', () => {
  it('throws config error when API key is missing', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    setEmbeddingsRequesterForTests(async () => {
      throw new EmbedConfigError();
    });
    try {
      await expect(embedTexts(['hi'])).rejects.toBeInstanceOf(EmbedConfigError);
    } finally {
      if (prev === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = prev;
      }
    }
  });

  it('uses the test override and still validates dim', async () => {
    setEmbedderForTests(async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
    const vectors = await embedTexts(['alpha']);
    expect(vectors[0]).toHaveLength(EMBED_DIM);
  });
});
