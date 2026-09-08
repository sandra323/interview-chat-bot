import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_BASE_SEARCH_TOOL } from '@ai-chat/shared';
import { retrievalHintFromToolEvent } from '../retrievalHint';

describe('retrievalHintFromToolEvent', () => {
  it('shows a searching hint on start', () => {
    expect(retrievalHintFromToolEvent(KNOWLEDGE_BASE_SEARCH_TOOL, 'start')).toBe(
      '正在检索知识库…',
    );
  });

  it('shows the unavailable hint on error', () => {
    expect(retrievalHintFromToolEvent(KNOWLEDGE_BASE_SEARCH_TOOL, 'error')).toBe(
      '知识库检索暂不可用，将按普通对话回答',
    );
  });

  it('clears the hint when retrieval ends', () => {
    expect(retrievalHintFromToolEvent(KNOWLEDGE_BASE_SEARCH_TOOL, 'end')).toBeNull();
  });

  it('ignores unrelated tool events', () => {
    expect(retrievalHintFromToolEvent('other_tool', 'start')).toBeUndefined();
  });
});
