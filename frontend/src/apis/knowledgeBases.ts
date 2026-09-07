import type { KnowledgeBase, KnowledgeDocument, KnowledgeDocumentPage } from '@ai-chat/shared';
import { DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from './http/client';

export async function fetchKnowledgeBases(): Promise<KnowledgeBase[]> {
  const data = await apiGet<{ items: KnowledgeBase[] }>('/api/knowledge-bases');
  return data.items ?? [];
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
}): Promise<KnowledgeBase> {
  return apiPost<KnowledgeBase>('/api/knowledge-bases', input);
}

export async function fetchKnowledgeBase(
  knowledgeBaseId: string,
): Promise<KnowledgeBase> {
  return apiGet<KnowledgeBase>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
  );
}

export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  patch: { name?: string; description?: string },
): Promise<KnowledgeBase> {
  return apiPatch<KnowledgeBase>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
    patch,
  );
}

export async function deleteKnowledgeBase(
  knowledgeBaseId: string,
): Promise<{ id: string }> {
  return apiDelete(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
  );
}

export async function fetchKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  options?: { q?: string; page?: number; pageSize?: number },
): Promise<KnowledgeDocumentPage> {
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
  return apiGet<KnowledgeDocumentPage>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents?${query}`,
  );
}

export async function uploadKnowledgeBaseDocument(
  knowledgeBaseId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<KnowledgeDocument> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<KnowledgeDocument>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
    form,
    { onProgress },
  );
}
