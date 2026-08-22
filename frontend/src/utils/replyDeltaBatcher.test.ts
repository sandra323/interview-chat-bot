import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discardReplyDeltaQueue,
  enqueueReplyDelta,
  flushReplyDeltaQueue,
  resetReplyDeltaBatcherForTests,
  setReplyDeltaFlushHandler,
} from './replyDeltaBatcher';

describe('replyDeltaBatcher', () => {
  afterEach(() => {
    resetReplyDeltaBatcherForTests();
    vi.unstubAllGlobals();
  });

  it('coalesces multiple enqueues into one rAF flush', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames.length = 0;
    });

    const flushed: Array<{ id: string; n: number }> = [];
    setReplyDeltaFlushHandler((id, items) => {
      flushed.push({ id, n: items.length });
    });

    enqueueReplyDelta('c1', 'g1', 'a', 0);
    enqueueReplyDelta('c1', 'g1', 'b', 1);
    enqueueReplyDelta('c1', 'g1', 'c', 2);
    expect(frames).toHaveLength(1);
    expect(flushed).toHaveLength(0);

    frames[0](0);
    expect(flushed).toEqual([{ id: 'g1', n: 3 }]);
  });

  it('flushReplyDeltaQueue applies immediately and cancels rAF', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames.length = 0;
    });

    const flushed: number[] = [];
    setReplyDeltaFlushHandler((_id, items) => {
      flushed.push(items.length);
    });

    enqueueReplyDelta('c1', 'g1', 'a', 0);
    enqueueReplyDelta('c1', 'g1', 'b', 1);
    flushReplyDeltaQueue('g1');
    expect(flushed).toEqual([2]);
    expect(frames).toHaveLength(0);
  });

  it('discardReplyDeltaQueue drops without flush', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    const spy = vi.fn();
    setReplyDeltaFlushHandler(spy);
    enqueueReplyDelta('c1', 'g1', 'a', 0);
    discardReplyDeltaQueue('g1');
    flushReplyDeltaQueue('g1');
    expect(spy).not.toHaveBeenCalled();
  });
});
