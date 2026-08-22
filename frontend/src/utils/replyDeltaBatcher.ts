/**
 * Coalesce live reply_delta store writes to one update per animation frame.
 * Catch-up / end paths should flush or discard before applying authoritative content.
 */

export type QueuedReplyDelta = {
  conversationId: string;
  delta: string;
  offset: number;
};

type FlushHandler = (
  generationId: string,
  items: QueuedReplyDelta[],
) => void;

const queues = new Map<string, QueuedReplyDelta[]>();
let rafId: number | null = null;
let flushHandler: FlushHandler | null = null;

export function setReplyDeltaFlushHandler(handler: FlushHandler | null): void {
  flushHandler = handler;
}

function runFlush(generationId: string, items: QueuedReplyDelta[]): void {
  if (!items.length) return;
  flushHandler?.(generationId, items);
}

function scheduleFlush(): void {
  if (rafId != null) return;

  if (typeof requestAnimationFrame !== 'function') {
    queueMicrotask(() => {
      if (queues.size === 0) return;
      const snapshot = new Map(queues);
      queues.clear();
      for (const [id, items] of snapshot) {
        runFlush(id, items);
      }
    });
    return;
  }

  rafId = requestAnimationFrame(() => {
    rafId = null;
    const snapshot = new Map(queues);
    queues.clear();
    for (const [id, items] of snapshot) {
      runFlush(id, items);
    }
  });
}

/** Queue a live delta; store update happens on the next animation frame. */
export function enqueueReplyDelta(
  conversationId: string,
  generationId: string,
  delta: string,
  offset: number,
): void {
  let queue = queues.get(generationId);
  if (!queue) {
    queue = [];
    queues.set(generationId, queue);
  }
  queue.push({ conversationId, delta, offset });
  scheduleFlush();
}

/**
 * Synchronously apply queued deltas (cancel pending rAF for those ids).
 * @param generationId when omitted, flush every generation
 */
export function flushReplyDeltaQueue(generationId?: string): void {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (generationId) {
    const items = queues.get(generationId);
    queues.delete(generationId);
    if (items?.length) runFlush(generationId, items);
    // Re-schedule if other generations remain
    if (queues.size > 0) scheduleFlush();
    return;
  }

  const snapshot = new Map(queues);
  queues.clear();
  for (const [id, items] of snapshot) {
    runFlush(id, items);
  }
}

/** Drop queued deltas without applying (e.g. reply_end is authoritative). */
export function discardReplyDeltaQueue(generationId?: string): void {
  if (generationId) {
    queues.delete(generationId);
    if (queues.size === 0 && rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    return;
  }
  queues.clear();
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/** Test helper */
export function resetReplyDeltaBatcherForTests(): void {
  discardReplyDeltaQueue();
  flushHandler = null;
}
