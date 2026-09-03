/** 资料库文档（一条记录 = 一个文件）。 */

export const DOCUMENT_STATUSES = [
  'queued',
  'uploading',
  'ready',
  'failed',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** 单文件上限 20MB */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** 列表默认 / 表格每页条数 */
export const DOCUMENT_PAGE_SIZE = 10;

export const DOCUMENT_FILE_ACCEPT =
  '.pdf,.md,application/pdf,text/markdown';

export interface KnowledgeDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  progress: number;
  error: string | null;
  createdAt: number;
  /** 文件夹上传预留：相对路径；表格仍只展示 filename */
  sourceRelativePath: string | null;
}

export interface KnowledgeDocumentPage {
  items: KnowledgeDocument[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
