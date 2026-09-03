/**
 * 将实时 reply_delta 的 store 写入合并为每帧一次更新。
 * catch-up / 结束路径应在应用权威内容前先 flush 或 discard。
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

/** 排队实时 delta；store 更新在下一 animation frame 执行。 */
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
 * 同步应用已排队的 delta（取消这些 id 的 pending rAF）。
 * @param generationId 省略时 flush 所有 generation
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
    // 若仍有其他 generation，重新调度
    if (queues.size > 0) scheduleFlush();
    return;
  }

  const snapshot = new Map(queues);
  queues.clear();
  for (const [id, items] of snapshot) {
    runFlush(id, items);
  }
}

/** 丢弃已排队 delta 而不应用（如 reply_end 为权威）。 */
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

/** 测试辅助 */
export function resetReplyDeltaBatcherForTests(): void {
  discardReplyDeltaQueue();
  flushHandler = null;
}
