import { describe, expect, it } from 'vitest';
import { formatProgress, isBusy, isServerBusyStatus } from '../documentStatus';
import { kbDeleteConfirmContent } from '../kbDeleteConfirm';
import { MAX_PARALLEL_UPLOADS, POLL_MS } from '../useDocumentLibrary';

describe('document status copy', () => {
  it('distinguishes pending and processing', () => {
    expect(formatProgress(0, 'pending')).toBe('等待处理');
    expect(formatProgress(40, 'processing')).toBe('处理中 40%');
    expect(formatProgress(10, 'uploading')).toBe('上传中 10%');
    expect(formatProgress(0, 'queued')).toBe('排队中');
  });

  it('treats processing as busy and poll-worthy', () => {
    expect(isBusy('processing')).toBe(true);
    expect(isBusy('ready')).toBe(false);
    expect(isServerBusyStatus('pending')).toBe(true);
    expect(isServerBusyStatus('queued')).toBe(false);
  });
});

describe('kb delete confirm', () => {
  it('allows deleting the last knowledge base with extra copy', () => {
    const last = kbDeleteConfirmContent('默认资料库', true);
    expect(last).toContain('确定删除「默认资料库」吗');
    expect(last).toContain('全部文件将一并删除');
    expect(last).toContain('这是你仅剩的知识库');
    expect(kbDeleteConfirmContent('库A', false)).not.toContain(
      '这是你仅剩的知识库',
    );
  });
});

describe('upload/poll constants', () => {
  it('keeps 2.5s polling and 3 parallel uploads', () => {
    expect(POLL_MS).toBe(2500);
    expect(MAX_PARALLEL_UPLOADS).toBe(3);
  });
});
