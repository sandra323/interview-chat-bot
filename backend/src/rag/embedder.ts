import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_MODEL_VERSION,
  EMBED_BATCH_SIZE,
  EMBED_DIM,
  EMBED_MAX_RETRIES,
  EMBED_TIMEOUT_MS,
} from './chunkConfig.js';
import {
  EmbedConfigError,
  EmbedQuotaError,
  EmbedResponseError,
  EmbedUnavailableError,
} from './ingestErrors.js';

export type EmbedTextsFn = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingModelInfo {
  model: string;
  version: string;
}

type EmbeddingsRequester = (batch: string[]) => Promise<number[][]>;

let overrideEmbed: EmbedTextsFn | null = null;
let requesterOverride: EmbeddingsRequester | null = null;

export function embeddingModelInfo(): EmbeddingModelInfo {
  return {
    model:
      process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    version:
      process.env.OPENAI_EMBEDDING_MODEL_VERSION?.trim() ||
      DEFAULT_EMBEDDING_MODEL_VERSION,
  };
}

export function setEmbedderForTests(fn: EmbedTextsFn): void {
  overrideEmbed = fn;
}

export function resetEmbedderForTests(): void {
  overrideEmbed = null;
  requesterOverride = null;
}

/** 单测用：注入 embeddings.create 的替代实现。 */
export function setEmbeddingsRequesterForTests(
  requester: EmbeddingsRequester,
): void {
  requesterOverride = requester;
}

export function createDeterministicEmbedding(
  text: string,
  dim = EMBED_DIM,
): number[] {
  const hash = createHash('sha256').update(text).digest();
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i += 1) {
    out[i] = hash[i % hash.length]! / 255;
  }
  return out;
}

export function createDeterministicEmbeddings(texts: string[]): number[][] {
  return texts.map((text) => createDeterministicEmbedding(text));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (overrideEmbed) {
    const vectors = await overrideEmbed(texts);
    assertEmbeddingBatch(texts.length, vectors);
    return vectors;
  }
  return embedTextsWithRequester(texts, requesterOverride ?? requestOpenAIBatch);
}

export async function embedTextsWithRequester(
  texts: string[],
  request: EmbeddingsRequester,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await requestBatchWithRetry(batch, request);
    out.push(...vectors);
  }
  return out;
}

async function requestBatchWithRetry(
  batch: string[],
  request: EmbeddingsRequester,
): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < EMBED_MAX_RETRIES; attempt += 1) {
    try {
      const vectors = await request(batch);
      assertEmbeddingBatch(batch.length, vectors);
      return vectors;
    } catch (error) {
      if (
        error instanceof EmbedConfigError ||
        error instanceof EmbedResponseError ||
        error instanceof EmbedQuotaError
      ) {
        throw error;
      }
      if (isQuotaExhausted(error)) {
        throw new EmbedQuotaError();
      }
      if (!isRetryable(error) || attempt === EMBED_MAX_RETRIES - 1) {
        throw error instanceof EmbedUnavailableError
          ? error
          : new EmbedUnavailableError(error);
      }
      lastError = error;
      await sleep(200 * 2 ** attempt);
    }
  }
  throw new EmbedUnavailableError(lastError);
}

async function requestOpenAIBatch(batch: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new EmbedConfigError();
  }
  const { model } = embeddingModelInfo();
  const client = new OpenAI({ apiKey, timeout: EMBED_TIMEOUT_MS });
  try {
    const response = await client.embeddings.create({
      model,
      input: batch,
    });
    return response.data.map((item) => item.embedding);
  } catch (error) {
    if (isQuotaExhausted(error)) {
      throw new EmbedQuotaError();
    }
    if (isRetryable(error)) {
      throw new EmbedUnavailableError(error);
    }
    throw new EmbedUnavailableError(error);
  }
}

function isQuotaExhausted(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { status?: unknown; code?: unknown; type?: unknown };
  if (Number(record.status) === 429 && record.type === 'insufficient_quota') {
    return true;
  }
  return (
    record.code === 'insufficient_quota' ||
    record.code === 'credit_balance_exhausted'
  );
}

function assertEmbeddingBatch(
  expectedCount: number,
  vectors: number[][],
): void {
  if (vectors.length !== expectedCount) {
    throw new EmbedResponseError(
      `expected ${expectedCount} embeddings, got ${vectors.length}`,
    );
  }
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
      throw new EmbedResponseError(
        `expected embedding dim ${EMBED_DIM}, got ${vector?.length ?? 0}`,
      );
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (isQuotaExhausted(error)) {
    return false;
  }
  if (error instanceof EmbedUnavailableError) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status: unknown }).status);
    return status === 429 || (status >= 500 && status < 600);
  }
  if (error instanceof Error && /timeout|timed out|ETIMEDOUT/i.test(error.message)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
