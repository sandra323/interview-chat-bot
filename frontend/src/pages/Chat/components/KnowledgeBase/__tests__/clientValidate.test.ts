import { describe, expect, it } from 'vitest';
import { DOCUMENT_MAX_BYTES } from '@ai-chat/shared';
import { clientValidate, UNSUPPORTED_TYPE_MSG } from '../clientValidate';

function file(name: string, bytes: number[]): File {
  const payload = Uint8Array.from(bytes);
  return {
    name,
    size: payload.byteLength,
    type: '',
    slice: () =>
      ({
        arrayBuffer: async () => payload.buffer,
      }) as Blob,
  } as File;
}

describe('clientValidate', () => {
  it('rejects unsupported extensions', async () => {
    expect(await clientValidate(file('a.exe', [1]))).toBe(UNSUPPORTED_TYPE_MSG);
  });

  it('rejects empty files', async () => {
    expect(await clientValidate(file('a.md', []))).toContain('空文件');
  });

  it('rejects oversized files', async () => {
    const big = file('a.txt', [1]);
    Object.defineProperty(big, 'size', { value: DOCUMENT_MAX_BYTES + 1 });
    expect(await clientValidate(big)).toContain('20MB');
  });

  it('rejects pdf without magic', async () => {
    expect(await clientValidate(file('a.pdf', [1, 2, 3, 4]))).toContain('PDF');
  });

  it('accepts pdf magic', async () => {
    expect(
      await clientValidate(file('a.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d])),
    ).toBeNull();
  });

  it('rejects docx without zip magic', async () => {
    expect(await clientValidate(file('a.docx', [1, 2, 3]))).toContain('Word');
  });

  it('accepts docx zip magic', async () => {
    expect(await clientValidate(file('a.docx', [0x50, 0x4b, 3, 4]))).toBeNull();
  });

  it('rejects txt or md that is actually a binary payload', async () => {
    expect(await clientValidate(file('a.txt', [0, 1, 2]))).toBe(UNSUPPORTED_TYPE_MSG);
    expect(
      await clientValidate(file('a.md', [0x25, 0x50, 0x44, 0x46])),
    ).toBe(UNSUPPORTED_TYPE_MSG);
  });

  it('accepts a normal markdown file', async () => {
    expect(await clientValidate(file('笔记.md', [0x23, 0x20]))).toBeNull();
  });

  it('accepts a file exactly at the size limit', async () => {
    const exact = file('a.txt', [1]);
    Object.defineProperty(exact, 'size', { value: DOCUMENT_MAX_BYTES });
    expect(await clientValidate(exact)).toBeNull();
  });
});
