import { describe, expect, it } from 'vitest';
import {
  resolveKnowledgeBaseFromCatalog,
  resolveKnowledgeBaseSelection,
} from '../knowledgeBaseOptions';
import { useKnowledgeBaseCatalog } from '@/store/useKnowledgeBaseCatalog';

describe('resolveKnowledgeBaseSelection', () => {
  it('returns null when binding is empty', () => {
    expect(resolveKnowledgeBaseSelection(null, ['kb-1'], true)).toBeNull();
  });

  it('keeps binding while catalog is not ready', () => {
    expect(resolveKnowledgeBaseSelection('gone-id', [], false)).toBe('gone-id');
  });

  it('clears binding when id is missing from ready catalog', () => {
    expect(resolveKnowledgeBaseSelection('gone-id', ['kb-1'], true)).toBeNull();
  });

  it('keeps binding when id exists in ready catalog', () => {
    expect(resolveKnowledgeBaseSelection('kb-1', ['kb-1'], true)).toBe('kb-1');
  });

  it('keeps binding when catalog failed to load', () => {
    expect(resolveKnowledgeBaseSelection('kb-1', [], false)).toBe('kb-1');
  });
});

describe('resolveKnowledgeBaseFromCatalog', () => {
  it('uses catalog store state', () => {
    useKnowledgeBaseCatalog.setState({
      items: [
        {
          id: 'kb-1',
          name: '项目库',
          description: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      status: 'ready',
      error: null,
    });
    expect(resolveKnowledgeBaseFromCatalog('gone-id')).toBeNull();
    expect(resolveKnowledgeBaseFromCatalog('kb-1')).toBe('kb-1');
  });
});
