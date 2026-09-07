import type { DocumentKind } from '../../documents/validateUpload.js';
import { parseDocx } from './parseDocx.js';
import { parsePdf } from './parsePdf.js';
import { parsePlain } from './parsePlain.js';
import type { ParsedDocument } from './types.js';

export async function parseDocument(
  kind: DocumentKind,
  buffer: Buffer,
): Promise<ParsedDocument> {
  if (kind === 'pdf') {
    return parsePdf(buffer);
  }
  if (kind === 'docx') {
    return parseDocx(buffer);
  }
  return parsePlain(buffer, kind);
}
