import { DOCUMENT_MAX_BYTES } from '@ai-chat/shared';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const ZIP_MAGIC = [0x50, 0x4b];
export const UNSUPPORTED_TYPE_MSG =
  '哎呀，只支持 PDF、Markdown、TXT 或 Word（.docx）';

function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

function hasZipMagic(bytes: Uint8Array): boolean {
  if (bytes.length < ZIP_MAGIC.length) return false;
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

function hasNulByte(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 512).includes(0);
}

export function guessMimeType(filename: string, fileType: string): string {
  if (fileType) return fileType;
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'text/markdown';
}

export async function clientValidate(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (
    !name.endsWith('.pdf') &&
    !name.endsWith('.md') &&
    !name.endsWith('.txt') &&
    !name.endsWith('.docx')
  ) {
    return UNSUPPORTED_TYPE_MSG;
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return '哎呀，文件太大了，请上传 20MB 以内的文件';
  }
  if (file.size === 0) {
    return '哎呀，空文件不能上传，请换个文件再试';
  }
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (name.endsWith('.pdf') && !hasPdfMagic(head)) {
    return '哎呀，文件内容不是有效的 PDF';
  }
  if (name.endsWith('.docx') && !hasZipMagic(head)) {
    return '哎呀，文件内容不是有效的 Word 文档';
  }
  if (
    (name.endsWith('.md') || name.endsWith('.txt')) &&
    (hasPdfMagic(head) || hasNulByte(head))
  ) {
    return UNSUPPORTED_TYPE_MSG;
  }
  return null;
}
