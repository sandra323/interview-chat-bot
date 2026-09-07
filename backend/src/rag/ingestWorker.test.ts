import { describe, expect, it, vi } from 'vitest';
import { ingestDraftsForTests } from './ingestWorker.js';
import { EmbedUnavailableError } from './ingestErrors.js';
import type { ChunkDraft } from './chunker.js';
import { createDeterministicEmbedding } from './embedder.js';

const draft: ChunkDraft = {
  content: 'hello',
  metadata: { filename: 'a.txt', file_type: 'txt' },
};

describe('ingestDraftsForTests', () => {
  it('does not persist when embed fails', async () => {
    const persist = vi.fn();
    await expect(
      ingestDraftsForTests(
        [draft],
        persist,
        async () => {
          throw new EmbedUnavailableError();
        },
      ),
    ).rejects.toBeInstanceOf(EmbedUnavailableError);
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists after embed succeeds', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    await ingestDraftsForTests([draft], persist, async (texts) =>
      texts.map((text) => createDeterministicEmbedding(text)),
    );
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
