import { describe, expect, it } from 'vitest';
import { DOCUMENT_PAGE_SIZE, type KnowledgeDocument } from '@ai-chat/shared';
import {
  computePageAfterServerDelete,
  isDuplicateUploadMessage,
  matchesQuery,
  mergeTableDocs,
  shouldPauseDocumentPoll,
  summarizeBatchDelete,
} from '../documentLibraryHelpers';

function doc(id: string, filename: string): KnowledgeDocument {
  return {
    id,
    filename,
    mimeType: 'text/plain',
    sizeBytes: 1,
    status: 'ready',
    progress: 100,
    error: null,
    createdAt: 0,
    sourceRelativePath: null,
  };
}

describe('documentLibraryHelpers', () => {
  it('detects duplicate upload messages', () => {
    expect(isDuplicateUploadMessage('已有相同文件')).toBe(true);
    expect(isDuplicateUploadMessage('同名文件已存在')).toBe(true);
    expect(isDuplicateUploadMessage('相同内容的文件')).toBe(true);
    expect(isDuplicateUploadMessage('上传失败')).toBe(false);
  });

  it('matches filename case-insensitively', () => {
    expect(matchesQuery('Report.PDF', 'pdf')).toBe(true);
    expect(matchesQuery('notes.txt', 'doc')).toBe(false);
    expect(matchesQuery('notes.txt', '')).toBe(true);
  });

  it('merges local rows ahead of server rows without duplicate ids', () => {
    const merged = mergeTableDocs(
      [doc('local-1', 'draft.txt')],
      [doc('server-1', 'ready.txt'), doc('local-1', 'draft.txt')],
      '',
    );
    expect(merged.map((row) => row.id)).toEqual(['local-1', 'server-1']);
  });

  it('filters local rows by query while server rows stay as returned by API', () => {
    const merged = mergeTableDocs(
      [doc('local-1', 'alpha.txt'), doc('local-2', 'beta.txt')],
      [doc('server-1', 'beta.txt')],
      'alp',
    );
    expect(merged.map((row) => row.id)).toEqual(['local-1', 'server-1']);
  });

  it('summarizes batch delete results', () => {
    const summary = summarizeBatchDelete([
      { status: 'fulfilled', value: 'a' },
      { status: 'rejected', reason: new Error('boom') },
    ]);
    expect(summary.deletedServerIds).toEqual(['a']);
    expect(summary.failures).toHaveLength(1);
  });

  it('moves page back when current page exceeds max after delete', () => {
    const result = computePageAfterServerDelete(3, 25, 10, DOCUMENT_PAGE_SIZE);
    expect(result).toEqual({ nextPage: 2, shouldRefresh: false });
  });

  it('refreshes in place when page still valid after delete', () => {
    const result = computePageAfterServerDelete(1, 25, 1, DOCUMENT_PAGE_SIZE);
    expect(result).toEqual({ nextPage: 1, shouldRefresh: true });
  });

  it('does not refresh when nothing was deleted', () => {
    expect(computePageAfterServerDelete(2, 11, 0)).toEqual({
      nextPage: 2,
      shouldRefresh: false,
    });
  });

  it('steps back to page 1 when the last page is emptied', () => {
    const result = computePageAfterServerDelete(2, DOCUMENT_PAGE_SIZE, DOCUMENT_PAGE_SIZE);
    expect(result).toEqual({ nextPage: 1, shouldRefresh: false });
  });

  it('pauses polling when tab is hidden', () => {
    expect(shouldPauseDocumentPoll('hidden')).toBe(true);
    expect(shouldPauseDocumentPoll('visible')).toBe(false);
  });
});
