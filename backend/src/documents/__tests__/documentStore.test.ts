import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentStore } from '../documentStore.js';

describe('DocumentStore', () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const p of paths) {
      try {
        fs.rmSync(p, { force: true });
        fs.rmSync(`${p}-wal`, { force: true });
        fs.rmSync(`${p}-shm`, { force: true });
      } catch {
        // 忽略
      }
    }
    paths.length = 0;
  });

  function createStore() {
    const dbPath = path.join(
      os.tmpdir(),
      `doc-store-${crypto.randomUUID()}.db`,
    );
    paths.push(dbPath);
    return new DocumentStore(dbPath);
  }

  function insert(
    store: DocumentStore,
    input: {
      owner: string;
      filename: string;
      createdAt: number;
    },
  ) {
    const id = crypto.randomUUID();
    store.insert({
      id,
      ownerUsername: input.owner,
      filename: input.filename,
      mimeType: 'text/markdown',
      sizeBytes: 8,
      storagePath: `${input.owner}/${id}.md`,
      status: 'ready',
      progress: 100,
      error: null,
      createdAt: input.createdAt,
      sourceRelativePath: null,
    });
    return id;
  }

  it('scopes list and get by owner username', () => {
    const store = createStore();
    const mine = insert(store, {
      owner: 'demo',
      filename: 'mine.md',
      createdAt: 2,
    });
    insert(store, { owner: 'other', filename: 'theirs.md', createdAt: 3 });

    const page = store.listPage('demo');
    expect(page.total).toBe(1);
    expect(page.items.map((d) => d.filename)).toEqual(['mine.md']);
    expect(store.getByIdForOwner(mine, 'other')).toBeNull();
    expect(store.getByIdForOwner(mine, 'demo')?.filename).toBe('mine.md');
    expect(store.deleteByIdForOwner(mine, 'other')).toBeNull();
    expect(store.deleteByIdForOwner(mine, 'demo')?.id).toBe(mine);
    expect(store.getByIdForOwner(mine, 'demo')).toBeNull();
    expect(store.listPage('demo').total).toBe(0);
    store.close();
  });

  it('fuzzy-searches filename and pages newest first', () => {
    const store = createStore();
    for (let i = 1; i <= 12; i += 1) {
      insert(store, {
        owner: 'demo',
        filename: i % 2 === 0 ? `resume-${i}.md` : `notes-${i}.pdf`,
        createdAt: i,
      });
    }

    const searched = store.listPage('demo', { q: 'resume', page: 1, pageSize: 10 });
    expect(searched.total).toBe(6);
    expect(searched.items.every((d) => d.filename.includes('resume'))).toBe(
      true,
    );

    const page1 = store.listPage('demo', { page: 1, pageSize: 10 });
    expect(page1.total).toBe(12);
    expect(page1.hasMore).toBe(true);
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0]?.filename).toBe('resume-12.md');

    const page2 = store.listPage('demo', { page: 2, pageSize: 10 });
    expect(page2.hasMore).toBe(false);
    expect(page2.items).toHaveLength(2);
    store.close();
  });

  it('escapes LIKE wildcards in search', () => {
    const store = createStore();
    insert(store, { owner: 'demo', filename: '100%.md', createdAt: 1 });
    insert(store, { owner: 'demo', filename: 'plain.md', createdAt: 2 });

    const page = store.listPage('demo', { q: '100%' });
    expect(page.total).toBe(1);
    expect(page.items[0]?.filename).toBe('100%.md');
    store.close();
  });
});
