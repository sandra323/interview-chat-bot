import {
  DEFAULT_VOYAGE_RERANK_MODEL,
  DEFAULT_VOYAGE_RERANK_URL,
  EMBED_MAX_INPUT_CHARS,
  RERANK_MAX_RETRIES,
  RERANK_TIMEOUT_MS,
} from './chunkConfig.js';
import {
  RerankConfigError,
  RerankQuotaError,
  RerankResponseError,
  RerankUnavailableError,
} from './rerankErrors.js';

export interface VoyageRerankResult {
  index: number;
  relevanceScore: number;
}

export interface RequestVoyageRerankInput {
  query: string;
  documents: string[];
  topK?: number;
}

export type RerankRequester = (
  input: RequestVoyageRerankInput & { model: string; url: string },
) => Promise<VoyageRerankResult[]>;

let requesterOverride: RerankRequester | null = null;

/** 单测用：注入 rerank HTTP 替代实现。 */
export function setRerankRequesterForTests(fn: RerankRequester | null): void {
  requesterOverride = fn;
}

export function resetRerankRequesterForTests(): void {
  requesterOverride = null;
}

export function voyageRerankModel(): string {
  return process.env.VOYAGE_RERANK_MODEL?.trim() || DEFAULT_VOYAGE_RERANK_MODEL;
}

function voyageRerankUrl(): string {
  return process.env.VOYAGE_RERANK_URL?.trim() || DEFAULT_VOYAGE_RERANK_URL;
}

/**
 * 有 key 且（非生产或 URL 为 https）时才发 Voyage。
 * 生产环境非 https URL 视为未配置，避免明文出网。
 */
export function isVoyageRerankConfigured(): boolean {
  const key = process.env.VOYAGE_API_KEY?.trim() ?? '';
  if (!key) {
    return false;
  }
  const url = voyageRerankUrl();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && !url.startsWith('https://')) {
    return false;
  }
  return true;
}

/**
 * 按 relevanceScore 降序重排；并列保持原 RRF 下标顺序。
 * scores 必须恰好是 0..n-1 的排列，否则抛 RerankResponseError。
 */
export function orderHitsByRerank<T>(
  hits: T[],
  scores: VoyageRerankResult[],
): T[] {
  if (hits.length === 0) {
    if (scores.length === 0) {
      return [];
    }
    throw new RerankResponseError('rerank scores for empty hits');
  }
  if (scores.length !== hits.length) {
    throw new RerankResponseError(
      `expected ${hits.length} rerank scores, got ${scores.length}`,
    );
  }

  const seen = new Set<number>();
  for (const row of scores) {
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= hits.length) {
      throw new RerankResponseError(`rerank index out of range: ${row.index}`);
    }
    if (seen.has(row.index)) {
      throw new RerankResponseError(`duplicate rerank index: ${row.index}`);
    }
    if (!Number.isFinite(row.relevanceScore)) {
      throw new RerankResponseError('rerank score is not finite');
    }
    seen.add(row.index);
  }

  return [...scores]
    .sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.index - b.index;
    })
    .map((row) => hits[row.index]!);
}

/**
 * 调用 Voyage rerank REST。空 documents 返回 [] 且不打网。
 * 无 key / 生产非 https 抛 RerankConfigError；坏响应用 RerankResponseError；
 * 超时/429/5xx 重试后抛 RerankUnavailableError。编排层应 fail-open。
 */
export async function requestVoyageRerank(
  input: RequestVoyageRerankInput,
): Promise<VoyageRerankResult[]> {
  const documents = input.documents.map((text) =>
    text.length <= EMBED_MAX_INPUT_CHARS
      ? text
      : text.slice(0, EMBED_MAX_INPUT_CHARS),
  );
  if (documents.length === 0) {
    return [];
  }
  if (!requesterOverride && !isVoyageRerankConfigured()) {
    throw new RerankConfigError();
  }

  const topK = input.topK ?? documents.length;
  const payload = {
    query: input.query,
    documents,
    topK,
    model: voyageRerankModel(),
    url: voyageRerankUrl(),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < RERANK_MAX_RETRIES; attempt += 1) {
    try {
      const request = requesterOverride ?? fetchVoyageRerank;
      return await request(payload);
    } catch (error) {
      if (
        error instanceof RerankConfigError ||
        error instanceof RerankResponseError ||
        error instanceof RerankQuotaError
      ) {
        throw error;
      }
      if (!isRetryable(error) || attempt === RERANK_MAX_RETRIES - 1) {
        throw error instanceof RerankUnavailableError
          ? error
          : new RerankUnavailableError(error);
      }
      lastError = error;
      await sleep(200 * 2 ** attempt);
    }
  }
  throw new RerankUnavailableError(lastError);
}

async function fetchVoyageRerank(
  input: RequestVoyageRerankInput & { model: string; url: string },
): Promise<VoyageRerankResult[]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim() ?? '';
  let response: Response;
  try {
    response = await fetch(input.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: input.query,
        documents: input.documents,
        model: input.model,
        top_k: input.topK ?? input.documents.length,
        truncation: true,
      }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RerankUnavailableError(error);
  }

  const text = await response.text();
  if (!response.ok) {
    const wrapped = Object.assign(new Error(`voyage rerank ${response.status}`), {
      status: response.status,
    });
    if (isQuotaExhausted(response.status, text)) {
      throw new RerankQuotaError();
    }
    if (response.status === 401 || response.status === 403) {
      throw new RerankConfigError('rerank-unauthorized');
    }
    if (isRetryableStatus(response.status)) {
      throw new RerankUnavailableError(wrapped);
    }
    throw new RerankUnavailableError(wrapped);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new RerankResponseError('voyage rerank returned non-json');
  }
  return parseVoyageData(parsed, input.documents.length);
}

function parseVoyageData(
  body: unknown,
  documentCount: number,
): VoyageRerankResult[] {
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new RerankResponseError('voyage rerank missing data');
  }
  const data = (body as { data: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new RerankResponseError('voyage rerank empty data');
  }

  return data.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new RerankResponseError('voyage rerank invalid item');
    }
    const record = item as { index?: unknown; relevance_score?: unknown };
    const index = Number(record.index);
    const relevanceScore = Number(record.relevance_score);
    if (!Number.isInteger(index) || index < 0 || index >= documentCount) {
      throw new RerankResponseError(`rerank index out of range: ${index}`);
    }
    if (!Number.isFinite(relevanceScore)) {
      throw new RerankResponseError('rerank score is not finite');
    }
    return { index, relevanceScore };
  });
}

function isQuotaExhausted(status: number, body: string): boolean {
  if (status === 402) {
    return true;
  }
  return /insufficient_quota|credit/i.test(body);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RerankUnavailableError) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return isRetryableStatus(Number((error as { status: unknown }).status));
  }
  if (error instanceof Error && /timeout|timed out|ETIMEDOUT|AbortError/i.test(error.message)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
