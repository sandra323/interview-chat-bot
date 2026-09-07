import {
  kindFromFilename,
  type DocumentKind,
} from '../documents/validateUpload.js';
import { getFileStorage } from '../documents/fileStorage.js';
import { logger } from '../utils/logger.js';
import { parseDocument } from './parse/parseDocument.js';
import { ParseEmptyError } from './parse/types.js';
import {
  getByIdForOwner,
  listIncompleteForParse,
  updateStatus,
} from './pgDocumentStore.js';

const MAX_CONCURRENT = 2;

interface ParseJob {
  documentId: string;
  ownerUsername: string;
  kind: DocumentKind;
}

const queue: ParseJob[] = [];
let running = 0;
const idleWaiters: Array<() => void> = [];

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
    void processDocument(job).finally(() => {
      running -= 1;
      pump();
      notifyIdle();
    });
  }
}

async function processDocument(job: ParseJob): Promise<void> {
  try {
    const current = await getByIdForOwner(job.documentId, job.ownerUsername);
    if (!current) {
      return;
    }

    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'processing',
      progress: 10,
      error: null,
    });

    await runParse(job, current.storagePath);
  } catch (error) {
    logger.warn('Document parse job failed before parse', {
      documentId: job.documentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    try {
      await updateStatus(job.documentId, job.ownerUsername, {
        status: 'failed',
        progress: 0,
        error: '哎呀，文件解析失败了，请换个文件再试',
      });
    } catch {
      // 忽略
    }
  }
}

async function runParse(job: ParseJob, storagePath: string): Promise<void> {
  try {
    const storage = getFileStorage();
    if (!storage.exists(storagePath)) {
      throw new Error('missing-file');
    }
    const buffer = storage.read(storagePath);
    await parseDocument(job.kind, buffer);

    const stillThere = await getByIdForOwner(job.documentId, job.ownerUsername);
    if (!stillThere) {
      return;
    }

    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'ready',
      progress: 100,
      error: null,
    });
  } catch (error) {
    const stillThere = await getByIdForOwner(job.documentId, job.ownerUsername);
    if (!stillThere) {
      return;
    }

    const msg =
      error instanceof ParseEmptyError
        ? error.message
        : '哎呀，文件解析失败了，请换个文件再试';
    logger.warn('Document parse failed', {
      documentId: job.documentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await updateStatus(job.documentId, job.ownerUsername, {
      status: 'failed',
      progress: 0,
      error: msg,
    });
  }
}

export function enqueueParse(job: ParseJob): void {
  if (
    queue.some(
      (item) =>
        item.documentId === job.documentId &&
        item.ownerUsername === job.ownerUsername,
    )
  ) {
    return;
  }
  queue.push(job);
  pump();
}

/** 进程重启后把未完成解析重新入队。 */
export async function resumeIncompleteParses(): Promise<number> {
  const rows = await listIncompleteForParse();
  let enqueued = 0;
  for (const row of rows) {
    const parsed = kindFromFilename(row.filename);
    if (!parsed) {
      await updateStatus(row.id, row.ownerUsername, {
        status: 'failed',
        progress: 0,
        error: '哎呀，文件解析失败了，请换个文件再试',
      });
      continue;
    }
    enqueueParse({
      documentId: row.id,
      ownerUsername: row.ownerUsername,
      kind: parsed.kind,
    });
    enqueued += 1;
  }
  if (enqueued > 0) {
    logger.info('Resumed incomplete document parses', { count: enqueued });
  }
  return enqueued;
}

/** 测试用：等到队列排空。 */
export function waitForParseIdle(): Promise<void> {
  if (running === 0 && queue.length === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    idleWaiters.push(resolve);
  });
}
