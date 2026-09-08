import type { KnowledgeDocument } from '@ai-chat/shared';

export function progressStatus(
  status: KnowledgeDocument['status'],
): 'active' | 'success' | 'exception' | 'normal' {
  if (status === 'failed') return 'exception';
  if (status === 'ready') return 'success';
  if (
    status === 'uploading' ||
    status === 'pending' ||
    status === 'processing'
  ) {
    return 'active';
  }
  return 'normal';
}

export function isBusy(status: KnowledgeDocument['status']): boolean {
  return (
    status === 'queued' ||
    status === 'uploading' ||
    status === 'pending' ||
    status === 'processing'
  );
}

export function isServerBusyStatus(
  status: KnowledgeDocument['status'],
): boolean {
  return status === 'pending' || status === 'processing';
}

export function formatProgress(
  percent: number | undefined,
  status: KnowledgeDocument['status'],
): string {
  const safe = Number.isFinite(percent) ? Math.round(percent!) : 0;
  if (status === 'queued') return '排队中';
  if (status === 'uploading') return `上传中 ${safe}%`;
  if (status === 'pending') return '等待处理';
  if (status === 'processing') return `处理中 ${safe}%`;
  return `${safe}%`;
}
