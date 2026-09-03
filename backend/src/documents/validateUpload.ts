import { DOCUMENT_MAX_BYTES } from '@ai-chat/shared';

export type DocumentKind = 'pdf' | 'markdown';

export interface ValidatedUpload {
  filename: string;
  ext: '.pdf' | '.md';
  kind: DocumentKind;
  mimeType: 'application/pdf' | 'text/markdown';
}

export type ValidateUploadResult =
  | { ok: true; value: ValidatedUpload }
  | { ok: false; msg: string };

const MAX_FILENAME_LEN = 255;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

function takeBasename(originalName: string): string {
  return originalName.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
}

function extKind(filename: string): { ext: '.pdf' | '.md'; kind: DocumentKind } | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return { ext: '.pdf', kind: 'pdf' };
  }
  if (lower.endsWith('.md')) {
    return { ext: '.md', kind: 'markdown' };
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
  return (
    mime === 'text/markdown' ||
    mime === 'text/x-markdown' ||
    mime === 'text/plain'
  );
}

export function hasPdfMagic(bytes: ArrayLike<number>): boolean {
  if (bytes.length < PDF_MAGIC.length) {
    return false;
  }
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
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
  return !hasPdfMagic(bytes) && !hasNulByte(bytes);
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

  const parsed = extKind(filename);
  if (!parsed) {
    return { ok: false, msg: '哎呀，只支持 PDF 或 Markdown 文件' };
  }

  if (!mimeAllowed(parsed.kind, input.mimeType)) {
    return { ok: false, msg: '哎呀，只支持 PDF 或 Markdown 文件' };
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
      msg:
        parsed.kind === 'pdf'
          ? '哎呀，文件内容不是有效的 PDF'
          : '哎呀，只支持 PDF 或 Markdown 文件',
    };
  }

  return {
    ok: true,
    value: {
      filename,
      ext: parsed.ext,
      kind: parsed.kind,
      mimeType: parsed.kind === 'pdf' ? 'application/pdf' : 'text/markdown',
    },
  };
}
