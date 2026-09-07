import { describe, expect, it } from 'vitest';
import { EMBED_MAX_INPUT_CHARS } from '../chunkConfig.js';
import { chunkDocument, hardSplit } from '../chunker.js';
import { ChunkEmptyError } from '../ingestErrors.js';

describe('chunkDocument', () => {
  it('keeps a short document as a single chunk', async () => {
    const chunks = await chunkDocument(
      { kind: 'txt', text: '一句话说明书。' },
      'short.txt',
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('一句话');
    expect(chunks[0]?.metadata.file_type).toBe('txt');
    expect(chunks[0]?.metadata.filename).toBe('short.txt');
  });

  it('splits markdown by headings and keeps section_title', async () => {
    const longA = '甲'.repeat(200);
    const longB = '乙'.repeat(200);
    const chunks = await chunkDocument(
      {
        kind: 'markdown',
        text: `# 第一章\n\n${longA}\n\n## 第二章\n\n${longB}`,
      },
      'guide.md',
    );
    const titles = new Set(
      chunks.map((chunk) => chunk.metadata.section_title).filter(Boolean),
    );
    expect(titles.has('第一章')).toBe(true);
    expect(titles.has('第二章')).toBe(true);
    expect(chunks.every((chunk) => chunk.metadata.file_type === 'markdown')).toBe(
      true,
    );
  });

  it('chunks markdown without headings', async () => {
    const text = `${'无标题段落。'.repeat(80)}\n\n${'另一段。'.repeat(80)}`;
    const chunks = await chunkDocument({ kind: 'markdown', text }, 'plain.md');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.metadata.section_title)).toBe(false);
  });

  it('keeps PDF page numbers and drops empty pages', async () => {
    const chunks = await chunkDocument(
      {
        kind: 'pdf',
        text: '有字',
        pages: [
          { page: 1, text: '第一页内容'.repeat(10) },
          { page: 2, text: '   ' },
          { page: 3, text: '第三页内容'.repeat(10) },
        ],
      },
      'doc.pdf',
    );
    expect(chunks.map((chunk) => chunk.metadata.page)).toEqual([1, 3]);
  });

  it('hard-splits punctuation-free text under the embed cap', async () => {
    const text = '字'.repeat(EMBED_MAX_INPUT_CHARS + 50);
    const chunks = await chunkDocument({ kind: 'txt', text }, 'long.txt');
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every((chunk) => chunk.content.length <= EMBED_MAX_INPUT_CHARS),
    ).toBe(true);
  });

  it('throws when nothing remains after cleaning', async () => {
    await expect(
      chunkDocument(
        {
          kind: 'pdf',
          text: '',
          pages: [{ page: 1, text: '   \n' }],
        },
        'empty.pdf',
      ),
    ).rejects.toBeInstanceOf(ChunkEmptyError);
  });
});

describe('hardSplit', () => {
  it('covers the full string without exceeding max', () => {
    const parts = hardSplit('abcdefghij', 4, 1);
    expect(parts.every((part) => part.length <= 4)).toBe(true);
    expect(parts.join('').includes('a')).toBe(true);
    expect(parts[parts.length - 1]?.endsWith('j')).toBe(true);
  });
});
