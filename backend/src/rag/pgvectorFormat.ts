import { EMBED_DIM } from './chunkConfig.js';

export function isFiniteVector(
  embedding: number[],
  dim = EMBED_DIM,
): boolean {
  if (!Array.isArray(embedding) || embedding.length !== dim) {
    return false;
  }
  return embedding.every((value) => Number.isFinite(value));
}

export function assertFiniteVector(
  embedding: number[],
  dim = EMBED_DIM,
): void {
  if (isFiniteVector(embedding, dim)) {
    return;
  }
  throw new Error(
    `expected a finite embedding of dim ${dim}, got length ${embedding?.length ?? 0}`,
  );
}

/** pgvector 文本字面量，配合 `$n::vector` 使用。 */
export function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
