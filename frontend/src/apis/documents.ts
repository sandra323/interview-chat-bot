import type { KnowledgeDocument, KnowledgeDocumentPage } from '@ai-chat/shared';
import { DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';
import { apiDelete, apiGet, apiGetBlob, apiUpload } from './http/client';

export async function fetchDocuments(options?: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<KnowledgeDocumentPage> {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? DOCUMENT_PAGE_SIZE;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const q = options?.q?.trim() ?? '';
  if (q) {
    query.set('q', q);
  }
  return apiGet<KnowledgeDocumentPage>(`/api/documents?${query}`);
}

export async function uploadDocument(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<KnowledgeDocument> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<KnowledgeDocument>('/api/documents', form, { onProgress });
}

export async function fetchDocumentContent(
  documentId: string,
): Promise<{ blob: Blob; contentType: string }> {
  return apiGetBlob(
    `/api/documents/${encodeURIComponent(documentId)}/content`,
  );
}

export async function deleteDocument(
  documentId: string,
): Promise<{ id: string }> {
  return apiDelete(`/api/documents/${encodeURIComponent(documentId)}`);
}
