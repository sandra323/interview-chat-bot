import type { DocumentKind } from '../../documents/validateUpload.js';

export class ParseEmptyError extends Error {
  constructor() {
    super(
      '未能从文件中提取文字，请确认文件包含可复制的文本，而不是纯图片扫描件',
    );
    this.name = 'ParseEmptyError';
  }
}

export interface ParsedPage {
  page: number;
  text: string;
}

export interface ParsedDocument {
  kind: DocumentKind;
  text: string;
  pages?: ParsedPage[];
}

export function collapseWhitespace(raw: string): string {
  return raw
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
