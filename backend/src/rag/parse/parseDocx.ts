import mammoth from 'mammoth';
import { ParseEmptyError, collapseWhitespace, type ParsedDocument } from './types.js';

export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer }); // 提取DOCX文件的文本内容
  const text = collapseWhitespace(result.value ?? ''); // 将DOCX文件的文本内容转换为字符串
  if (!text) {
    throw new ParseEmptyError();
  }
  return { kind: 'docx', text };
}
