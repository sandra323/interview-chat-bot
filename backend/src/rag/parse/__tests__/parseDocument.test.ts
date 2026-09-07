import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../parseDocument.js';
import { ParseEmptyError } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '__fixtures__');

/** 含可抽取文本的最小 PDF。 */
function samplePdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n',
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n',
  ];
  let body = '%PDF-1.1\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${xref}trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body);
}

describe('parseDocument', () => {
  it('extracts non-empty text from markdown and txt', async () => {
    const md = await parseDocument(
      'markdown',
      Buffer.from('\uFEFF# 标题\n\n内容\n\n\n'),
    );
    expect(md.text).toContain('标题');
    expect(md.kind).toBe('markdown');

    const txt = await parseDocument('txt', Buffer.from('hello txt'));
    expect(txt.text).toBe('hello txt');
  });

  it('extracts text from a simple PDF', async () => {
    const parsed = await parseDocument('pdf', samplePdf('Hello RAG'));
    expect(parsed.text).toMatch(/Hello RAG/);
    expect(parsed.pages?.length).toBeGreaterThan(0);
  });

  it('extracts text from a docx fixture', async () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'hello.docx'));
    const parsed = await parseDocument('docx', buffer);
    expect(parsed.text).toMatch(/Hello DOCX/);
  });

  it('fails when extracted text is empty', async () => {
    await expect(parseDocument('txt', Buffer.from('   \n\n'))).rejects.toBeInstanceOf(
      ParseEmptyError,
    );

    const emptyDocx = fs.readFileSync(path.join(fixturesDir, 'empty.docx'));
    await expect(parseDocument('docx', emptyDocx)).rejects.toBeInstanceOf(
      ParseEmptyError,
    );

    await expect(parseDocument('pdf', samplePdf(''))).rejects.toBeInstanceOf(
      ParseEmptyError,
    );
  });

  it('fails on a corrupt pdf', async () => {
    await expect(
      parseDocument('pdf', Buffer.from('%PDF-1.4 not-a-real-pdf')),
    ).rejects.toBeTruthy();
  });
});
