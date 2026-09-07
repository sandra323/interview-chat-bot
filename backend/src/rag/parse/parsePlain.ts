import type { DocumentKind } from '../../documents/validateUpload.js';
import { ParseEmptyError, collapseWhitespace, type ParsedDocument } from './types.js';

export function parsePlain(
  buffer: Buffer,
  kind: Extract<DocumentKind, 'markdown' | 'txt'>,
): ParsedDocument {
  const text = collapseWhitespace(buffer.toString('utf8')); // 将Buffer转换为字符串
  if (!text) {
    throw new ParseEmptyError();
  }
  return { kind, text };
}
