import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../contentHash.js';

describe('sha256Hex', () => {
  it('hashes buffer contents', () => {
    const buffer = Buffer.from('hello rag');
    expect(sha256Hex(buffer)).toBe(
      createHash('sha256').update(buffer).digest('hex'),
    );
    expect(sha256Hex(Buffer.from('hello rag'))).toBe(sha256Hex(buffer));
    expect(sha256Hex(Buffer.from('hello rag!'))).not.toBe(sha256Hex(buffer));
  });
});
