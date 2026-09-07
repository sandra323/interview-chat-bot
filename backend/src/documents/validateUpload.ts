import { DOCUMENT_MAX_BYTES } from '@ai-chat/shared';

export type DocumentKind = 'pdf' | 'markdown' | 'txt' | 'docx';

export interface ValidatedUpload {
  filename: string;
  ext: '.pdf' | '.md' | '.txt' | '.docx';
  kind: DocumentKind;
  mimeType:
    | 'application/pdf'
    | 'text/markdown'
    | 'text/plain'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

export type ValidateUploadResult =
  | { ok: true; value: ValidatedUpload }
  | { ok: false; msg: string };

const MAX_FILENAME_LEN = 255;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b]; // PK
const UNSUPPORTED_TYPE_MSG =
  '哎呀，只支持 PDF、Markdown、TXT 或 Word（.docx）';

const CANONICAL_MIME: Record<DocumentKind, ValidatedUpload['mimeType']> = {
  pdf: 'application/pdf',
  markdown: 'text/markdown',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function takeBasename(originalName: string): string {
  return originalName.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
}

export function kindFromFilename(
  filename: string,
): { ext: ValidatedUpload['ext']; kind: DocumentKind } | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return { ext: '.pdf', kind: 'pdf' };
  }
  if (lower.endsWith('.md')) {
    return { ext: '.md', kind: 'markdown' };
  }
  if (lower.endsWith('.txt')) {
    return { ext: '.txt', kind: 'txt' };
  }
  if (lower.endsWith('.docx')) {
    return { ext: '.docx', kind: 'docx' };
  }
  return null;
}

function mimeAllowed(kind: DocumentKind, mimeType: string): boolean {
  const mime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!mime || mime === 'application/octet-stream') {
    return true;
  }
  if (kind === 'pdf') {
    return mime === 'application/pdf' || mime === 'application/x-pdf';
  }
  if (kind === 'markdown') {
    return (
      mime === 'text/markdown' ||
      mime === 'text/x-markdown' ||
      mime === 'text/plain'
    );
  }
  if (kind === 'txt') {
    return mime === 'text/plain';
  }
  return (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/zip'
  );
}

export function hasPdfMagic(bytes: ArrayLike<number>): boolean {
  if (bytes.length < PDF_MAGIC.length) {
    return false;
  }
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

export function hasZipMagic(bytes: ArrayLike<number>): boolean {
  if (bytes.length < ZIP_MAGIC.length) {
    return false;
  }
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

function hasNulByte(bytes: ArrayLike<number>, limit = 512): boolean {
  const n = Math.min(bytes.length, limit);
  for (let i = 0; i < n; i += 1) {
    if (bytes[i] === 0) {
      return true;
    }
  }
  return false;
}

function contentMatchesKind(
  kind: DocumentKind,
  bytes: ArrayLike<number>,
): boolean {
  if (kind === 'pdf') {
    return hasPdfMagic(bytes);
  }
  if (kind === 'docx') {
    return hasZipMagic(bytes); // 检查文件是否是ZIP格式
  }
  return !hasPdfMagic(bytes) && !hasNulByte(bytes); // 检查文件是否是PDF格式或空文件
}

function contentMismatchMsg(kind: DocumentKind): string {
  if (kind === 'pdf') {
    return '哎呀，文件内容不是有效的 PDF';
  }
  if (kind === 'docx') {
    return '哎呀，文件内容不是有效的 Word 文档';
  }
  return UNSUPPORTED_TYPE_MSG;
}

/**
 * 校验上传文件名、扩展名、MIME、大小与文件头。
 * 展示名只保留 basename，避免路径注入。
 */
export function validateUpload(input: {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  bytes?: ArrayLike<number>;
}): ValidateUploadResult {
  const filename = takeBasename(input.originalName);
  if (!filename || filename === '.' || filename === '..') {
    return { ok: false, msg: '哎呀，文件名不对，请换个文件再试' };
  }
  if (filename.length > MAX_FILENAME_LEN) {
    return { ok: false, msg: '哎呀，文件名太长了，请缩短后再试' };
  }

  const parsed = kindFromFilename(filename); // 解析文件名
  if (!parsed) {
    return { ok: false, msg: UNSUPPORTED_TYPE_MSG }; // 返回不支持的文件类型
  }

  if (!mimeAllowed(parsed.kind, input.mimeType)) {
    return { ok: false, msg: UNSUPPORTED_TYPE_MSG };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
    return { ok: false, msg: '哎呀，文件大小不对，请换个文件再试' };
  }
  if (input.sizeBytes > DOCUMENT_MAX_BYTES) {
    return { ok: false, msg: '哎呀，文件太大了，请上传 20MB 以内的文件' };
  }
  if (input.sizeBytes === 0) {
    return { ok: false, msg: '哎呀，空文件不能上传，请换个文件再试' };
  }

  if (input.bytes && !contentMatchesKind(parsed.kind, input.bytes)) {
    return {
      ok: false,
      msg: contentMismatchMsg(parsed.kind),
    };
  }

  return {
    ok: true,
    value: {
      filename,
      ext: parsed.ext,
      kind: parsed.kind,
      mimeType: CANONICAL_MIME[parsed.kind],
    },
  };
}
