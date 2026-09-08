/** 资料库文档（一条记录 = 一个文件）。 */

export const DOCUMENT_STATUSES = [
  'queued',
  'uploading',
  'pending',
  'processing',
  'ready',
  'failed',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** 单文件上限 20MB */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** 列表默认 / 表格每页条数 */
export const DOCUMENT_PAGE_SIZE = 10;

export const DOCUMENT_FILE_ACCEPT =
  '.pdf,.md,.txt,.docx,application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 兼容层与迁移使用的默认知识库名称。 */
export const DEFAULT_KNOWLEDGE_BASE_NAME = '默认资料库';

/** 知识库名称 trim 后长度上限（与后端校验对齐）。 */
export const KB_NAME_MAX = 100;

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

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
