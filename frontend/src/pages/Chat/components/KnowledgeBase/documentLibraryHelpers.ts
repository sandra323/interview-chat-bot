import {
  DOCUMENT_PAGE_SIZE,
  type KnowledgeDocument,
} from '@ai-chat/shared';

export function isDuplicateUploadMessage(msg: string): boolean {
  return /同名文件|相同内容的文件|已有相同文件/.test(msg);
}

export function matchesQuery(filename: string, query: string): boolean {
  if (!query) return true;
  return filename.toLowerCase().includes(query.toLowerCase());
}

export function mergeTableDocs(
  localDocs: KnowledgeDocument[],
  items: KnowledgeDocument[],
  query: string,
): KnowledgeDocument[] {
  const visibleLocal = localDocs.filter((doc) =>
    matchesQuery(doc.filename, query),
  );
  const localIds = new Set(visibleLocal.map((doc) => doc.id));
  const serverItems = items.filter((doc) => !localIds.has(doc.id));
  return [...visibleLocal, ...serverItems];
}

export function computePageAfterServerDelete(
  page: number,
  total: number,
  deletedServerCount: number,
  pageSize = DOCUMENT_PAGE_SIZE,
): { nextPage: number; shouldRefresh: boolean } {
  if (deletedServerCount <= 0) {
    return { nextPage: page, shouldRefresh: false };
  }
  const nextTotal = Math.max(0, total - deletedServerCount);
  const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize));
  if (page > maxPage) {
    return { nextPage: maxPage, shouldRefresh: false };
  }
  return { nextPage: page, shouldRefresh: true };
}

export function summarizeBatchDelete(
  results: PromiseSettledResult<string>[],
): { deletedServerIds: string[]; failures: unknown[] } {
  const deletedServerIds: string[] = [];
  const failures: unknown[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      deletedServerIds.push(result.value);
    } else {
      failures.push(result.reason);
    }
  }
  return { deletedServerIds, failures };
}

export function shouldPauseDocumentPoll(
  visibilityState: DocumentVisibilityState,
): boolean {
  return visibilityState === 'hidden';
}
