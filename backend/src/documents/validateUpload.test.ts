import { describe, expect, it } from 'vitest';
import { DOCUMENT_MAX_BYTES } from '@ai-chat/shared';
import { validateUpload } from './validateUpload.js';

describe('validateUpload', () => {
  it('accepts pdf and markdown by extension', () => {
    const pdf = validateUpload({
      originalName: '面试/指南.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
    });
    expect(pdf).toEqual({
      ok: true,
      value: {
        filename: '指南.pdf',
        ext: '.pdf',
        kind: 'pdf',
        mimeType: 'application/pdf',
      },
    });

    const md = validateUpload({
      originalName: 'note.MD',
      mimeType: 'text/plain',
      sizeBytes: 4,
    });
    expect(md.ok).toBe(true);
    if (md.ok) {
      expect(md.value.filename).toBe('note.MD');
      expect(md.value.ext).toBe('.md');
      expect(md.value.mimeType).toBe('text/markdown');
    }
  });

  it('rejects unsupported types and oversized files', () => {
    expect(
      validateUpload({
        originalName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 10,
      }).ok,
    ).toBe(false);

    expect(
      validateUpload({
        originalName: 'a.pdf',
        mimeType: 'image/png',
        sizeBytes: 10,
      }).ok,
    ).toBe(false);

    const oversized = validateUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: DOCUMENT_MAX_BYTES + 1,
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.msg).toMatch(/20MB/);
    }
  });

  it('rejects mismatched magic bytes', () => {
    const fakePdf = validateUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8,
      bytes: Buffer.from('MZ\0\0fake'),
    });
    expect(fakePdf.ok).toBe(false);

    const pdfOk = validateUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8,
      bytes: Buffer.from('%PDF-1.4'),
    });
    expect(pdfOk.ok).toBe(true);

    const fakeMd = validateUpload({
      originalName: 'note.md',
      mimeType: 'text/markdown',
      sizeBytes: 8,
      bytes: Buffer.from('%PDF-1.4'),
    });
    expect(fakeMd.ok).toBe(false);
  });
});
