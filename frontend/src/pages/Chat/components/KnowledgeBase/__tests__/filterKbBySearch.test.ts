import { describe, expect, it } from 'vitest';
import type { KnowledgeBase } from '@ai-chat/shared';
import { filterKbBySearch } from '../filterKbBySearch';

const items: KnowledgeBase[] = [
  {
    id: '1',
    name: '项目资料',
    description: '',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: '2',
    name: '面试笔记',
    description: '',
    createdAt: 0,
    updatedAt: 0,
  },
];

describe('filterKbBySearch', () => {
  it('returns all items when search is blank', () => {
    expect(filterKbBySearch(items, '   ')).toEqual(items);
  });

  it('filters by name case-insensitively', () => {
    expect(filterKbBySearch(items, '面试')).toEqual([items[1]]);
  });
});
