import { describe, expect, it } from 'vitest';
import { alignReplyDelta, mergeCatchupContent } from './replyStreamAlign';

describe('alignReplyDelta', () => {
  it('appends when offset matches local length', () => {
    expect(alignReplyDelta('Hel', 'lo', 3)).toEqual({
      action: 'apply',
      content: 'Hello',
    });
  });

  it('ignores fully-contained duplicates', () => {
    expect(alignReplyDelta('Hello', 'Hel', 0)).toEqual({ action: 'ignore' });
    expect(alignReplyDelta('Hello', 'lo', 3)).toEqual({ action: 'ignore' });
  });

  it('applies only the new suffix on overlap', () => {
    expect(alignReplyDelta('Hel', 'llo', 2)).toEqual({
      action: 'apply',
      content: 'Hello',
    });
  });

  it('reports gap when offset skips ahead', () => {
    expect(alignReplyDelta('Hi', '!!!', 5)).toEqual({ action: 'gap' });
  });

  it('starts from empty at offset 0', () => {
    expect(alignReplyDelta('', 'A', 0)).toEqual({
      action: 'apply',
      content: 'A',
    });
  });
});

describe('mergeCatchupContent', () => {
  it('replaces from offset with server tail', () => {
    expect(mergeCatchupContent('Hello???', 'lo World', 3)).toBe('Hello World');
  });

  it('rebuilds when local is shorter than offset prefix', () => {
    expect(mergeCatchupContent('He', 'llo', 2)).toBe('Hello');
  });
});
