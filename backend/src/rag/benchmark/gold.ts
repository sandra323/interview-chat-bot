import { chunkKey } from './fixtures.js';
import type { BenchmarkQuery } from './types.js';

export interface SeededChunk {
  slug: string;
  anchor: string;
  content: string;
}

/**
 * 切分并写入后再绑定 gold。key 在库里找不到则调用方标 invalid-gold。
 */
export function bindRelevantKeys(
  query: BenchmarkQuery,
  chunks: readonly SeededChunk[],
): string[] {
  const wanted = new Set(query.anchors);
  const keys: string[] = [];
  for (const chunk of chunks) {
    if (!wanted.has(chunk.anchor)) {
      continue;
    }
    if (!chunk.content.includes(`«${chunk.anchor}»`)) {
      continue;
    }
    keys.push(chunkKey(chunk.slug, chunk.anchor));
  }
  return [...new Set(keys)];
}

export function hitKey(metadata: Record<string, unknown>): string | null {
  const slug = metadata.slug;
  const anchor = metadata.anchor;
  if (typeof slug !== 'string' || typeof anchor !== 'string') {
    return null;
  }
  if (!slug || !anchor) {
    return null;
  }
  return chunkKey(slug, anchor);
}
