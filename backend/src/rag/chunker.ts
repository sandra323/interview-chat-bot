import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  EMBED_MAX_INPUT_CHARS,
} from './chunkConfig.js';
import { ChunkEmptyError, ChunkTooLongError } from './ingestErrors.js';
import { collapseWhitespace, type ParsedDocument } from './parse/types.js';

export interface ChunkMetadata {
  filename: string;
  file_type: string;
  page?: number;
  section_title?: string;
}

export interface ChunkDraft {
  content: string;
  metadata: ChunkMetadata;
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ['\n\n', '\n', '。', '！', '？', '；', ' ', ''],
}); // 创建一个RecursiveCharacterTextSplitter实例

const HEADING_RE = /^(#{1,6})\s+(.+)$/; // 匹配标题

export async function chunkDocument(
  parsed: ParsedDocument, // 解析后的文档
  filename: string, // 文件名
): Promise<ChunkDraft[]> {
  const units = structuralUnits(parsed, filename); // 结构化单元
  const drafts: ChunkDraft[] = []; // 草稿

  for (const unit of units) {
    const text = collapseWhitespace(unit.content);
    if (!text) {
      continue;
    }
    for (const piece of await splitUnit(text)) {
      const content = collapseWhitespace(piece);
      if (!content) {
        continue;
      }
      if (content.length > EMBED_MAX_INPUT_CHARS) {
        throw new ChunkTooLongError();
      }
      drafts.push({ content, metadata: unit.metadata });
    }
  }

  if (drafts.length === 0) {
    throw new ChunkEmptyError();
  }
  return drafts;
}

/** 结构化单元 */
function structuralUnits(
  parsed: ParsedDocument,
  filename: string,
): ChunkDraft[] {
  if (parsed.kind === 'pdf') {
    return (parsed.pages ?? [{ page: 1, text: parsed.text }]).map((page) => ({
      content: page.text,
      metadata: {
        filename,
        file_type: 'pdf',
        page: page.page,
      },
    }));
  }

  if (parsed.kind === 'markdown') {
    return splitMarkdownSections(parsed.text).map((section) => ({
      content: section.body,
      metadata: {
        filename,
        file_type: 'markdown',
        ...(section.title ? { section_title: section.title } : {}),
      },
    }));
  }

  return splitParagraphs(parsed.text).map((paragraph) => ({
    content: paragraph,
    metadata: {
      filename,
      file_type: parsed.kind,
    },
  }));
}

function splitMarkdownSections(
  text: string,
): Array<{ title: string; body: string }> {
  const lines = text.split('\n');
  const sections: Array<{ title: string; body: string }> = [];
  let title = '';
  let buf: string[] = [];

  const flush = (): void => {
    const body = buf.join('\n').trim();
    if (body) {
      sections.push({ title, body });
    } else if (title) {
      sections.push({ title, body: title });
    }
    buf = [];
  };

  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      flush();
      title = match[2]?.trim() ?? '';
      continue;
    }
    buf.push(line);
  }
  flush();

  return sections.length > 0 ? sections : [{ title: '', body: text }];
}

function splitParagraphs(text: string): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

async function splitUnit(text: string): Promise<string[]> {
  if (text.length <= CHUNK_SIZE) {
    return [text];
  }
  const pieces = await splitter.splitText(text);
  const out: string[] = [];
  for (const piece of pieces) {
    if (piece.length <= EMBED_MAX_INPUT_CHARS) {
      out.push(piece);
      continue;
    }
    out.push(...hardSplit(piece, EMBED_MAX_INPUT_CHARS, CHUNK_OVERLAP));
  }
  return out;
}

export function hardSplit(
  text: string,
  max: number,
  overlap: number,
): string[] {
  if (text.length <= max) {
    return [text];
  }
  const step = Math.max(1, max - Math.max(0, overlap));
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + max));
    i += step;
  }
  return out;
}
