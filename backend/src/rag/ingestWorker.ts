import {
  kindFromFilename,
  type DocumentKind,
} from '../documents/validateUpload.js';
import { getFileStorage } from '../documents/fileStorage.js';
import { logger } from '../utils/logger.js';
import { INGEST_PROGRESS } from './chunkConfig.js';
import { chunkDocument, type ChunkDraft } from './chunker.js';
import { replaceForDocument } from './chunkStore.js';
import {
  embeddingModelInfo,
  embedTexts,
} from './embedder.js';
import { MissingFileError, userMessageForIngestError } from './ingestErrors.js';
import { parseDocument } from './parse/parseDocument.js';
import type { ParsedDocument } from './parse/types.js';
import {
  failStaleProcessing,
  getByIdForOwner,
  listIncompleteForIngest,
  updateStatus,
  type PgDocumentRow,
} from './pgDocumentStore.js';

const MAX_CONCURRENT = 2;

export interface IngestJob {
  documentId: string;
  ownerUsername: string;
  kind: DocumentKind;
}

const queue: IngestJob[] = [];
const runningIds = new Set<string>();
let running = 0;
const idleWaiters: Array<() => void> = [];

function jobKey(job: Pick<IngestJob, 'documentId' | 'ownerUsername'>): string {
  return `${job.ownerUsername}:${job.documentId}`;
}

function extractIngestCause(cause: unknown): Record<string, unknown> {
  if (typeof cause !== 'object' || cause === null) {
    return {};
  }
  const record = cause as { status?: unknown; code?: unknown; message?: unknown };
  return {
    causeStatus: record.status,
    causeCode: record.code,
    causeMessage:
      typeof record.message === 'string'
        ? record.message.slice(0, 200)
        : undefined,
  };
}

function notifyIdle(): void {
  if (running > 0 || queue.length > 0) {
    return;
  }
  while (idleWaiters.length > 0) {
    idleWaiters.shift()?.();
  }
}

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    if (!job) {
      break;
    }
    running += 1;
    runningIds.add(jobKey(job));
    void processDocument(job).finally(() => {
      runningIds.delete(jobKey(job));
      running -= 1;
      pump();
      notifyIdle();
    });
  }
}

function isQueuedOrRunning(job: IngestJob): boolean {
  const key = jobKey(job);
  if (runningIds.has(key)) {
    return true;
  }
  return queue.some(
    (item) =>
      item.documentId === job.documentId &&
      item.ownerUsername === job.ownerUsername,
  );
}

async function stillOwned(
  documentId: string,
  ownerUsername: string,
): Promise<PgDocumentRow | null> {
  return getByIdForOwner(documentId, ownerUsername);
}

async function markFailed(
  job: IngestJob,
  error: unknown,
  logMessage: string,
): Promise<void> {
  const current = await stillOwned(job.documentId, job.ownerUsername);
  if (!current) {
    return;
  }
  const detail =
    error instanceof Error && error.cause
      ? extractIngestCause(error.cause)
      : undefined;
  logger.warn(logMessage, {
    documentId: job.documentId,
    error: error instanceof Error ? error.message : 'Unknown error',
    userMessage: userMessageForIngestError(error),
    ...detail,
  });
  try {
    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'failed',
      progress: 0,
      error: userMessageForIngestError(error),
    });
  } catch {
    // 忽略
  }
}

async function processDocument(job: IngestJob): Promise<void> {
  try {
    const current = await stillOwned(job.documentId, job.ownerUsername);
    if (!current) {
      return;
    }

    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'processing',
      progress: INGEST_PROGRESS.started,
      error: null,
    });

    const parsed = await parseFromDisk(job, current.storagePath);
    if (!(await stillOwned(job.documentId, job.ownerUsername))) {
      return;
    }
    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'processing',
      progress: INGEST_PROGRESS.parsed,
      error: null,
    });

    const drafts = await chunkDocument(parsed, current.filename);
    if (!(await stillOwned(job.documentId, job.ownerUsername))) {
      return;
    }
    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'processing',
      progress: INGEST_PROGRESS.chunked,
      error: null,
    });

    const vectors = await embedTexts(drafts.map((draft) => draft.content));
    if (!(await stillOwned(job.documentId, job.ownerUsername))) {
      return;
    }
    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'processing',
      progress: INGEST_PROGRESS.embedded,
      error: null,
    });

    const model = embeddingModelInfo();
    const persisted = await replaceForDocument({
      ownerUsername: job.ownerUsername,
      documentId: job.documentId,
      knowledgeBaseId: current.knowledgeBaseId,
      embeddingModel: model.model,
      embeddingModelVersion: model.version,
      chunks: drafts.map((draft, index) => ({
        ...draft,
        chunkIndex: index,
        embedding: vectors[index]!,
        embeddingModel: model.model,
      })),
    });
    if (!persisted) {
      return;
    }
  } catch (error) {
    await markFailed(job, error, 'Document ingest job failed');
  }
}

async function parseFromDisk(
  job: IngestJob,
  storagePath: string,
): Promise<ParsedDocument> {
  const storage = getFileStorage();
  if (!storage.exists(storagePath)) {
    throw new MissingFileError();
  }
  const buffer = storage.read(storagePath);
  return parseDocument(job.kind, buffer);
}

export function enqueueIngest(job: IngestJob): void {
  if (isQueuedOrRunning(job)) {
    return;
  }
  queue.push(job);
  pump();
}

/** @deprecated 使用 enqueueIngest */
export const enqueueParse = enqueueIngest;

export async function resumeIncompleteIngests(): Promise<number> {
  const stale = await failStaleProcessing();
  if (stale > 0) {
    logger.info('Marked stale processing documents as failed', { count: stale });
  }

  const rows = await listIncompleteForIngest();
  let enqueued = 0;
  for (const row of rows) {
    const latest = await getByIdForOwner(row.id, row.ownerUsername);
    if (!latest) {
      continue;
    }
    const parsed = kindFromFilename(row.filename);
    if (!parsed) {
      await updateStatus(row.id, row.ownerUsername, {
        status: 'failed',
        progress: 0,
        error: '哎呀，文件解析失败了，请换个文件再试',
      });
      continue;
    }
    enqueueIngest({
      documentId: row.id,
      ownerUsername: row.ownerUsername,
      kind: parsed.kind,
    });
    enqueued += 1;
  }
  if (enqueued > 0) {
    logger.info('Resumed incomplete document ingests', { count: enqueued });
  }
  return enqueued;
}

/** @deprecated 使用 resumeIncompleteIngests */
export const resumeIncompleteParses = resumeIncompleteIngests;

export function waitForParseIdle(): Promise<void> {
  if (running === 0 && queue.length === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    idleWaiters.push(resolve);
  });
}

export const waitForIngestIdle = waitForParseIdle;

/** 测试：embed 失败时不应调用 persist。 */
export async function ingestDraftsForTests(
  drafts: ChunkDraft[],
  persist: typeof replaceForDocument,
  embed: typeof embedTexts,
): Promise<void> {
  const vectors = await embed(drafts.map((draft) => draft.content));
  await persist({
    ownerUsername: 'test',
    documentId: 'test',
    knowledgeBaseId: 'test',
    embeddingModel: 'test',
    embeddingModelVersion: 'test',
    chunks: drafts.map((draft, index) => ({
      ...draft,
      chunkIndex: index,
      embedding: vectors[index]!,
      embeddingModel: 'test',
    })),
  });
}
