import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** `src/rag` 或 `dist/rag` → backend 根目录 */
const backendRoot = path.resolve(__dirname, '../..');
/**
 * SQL 放在 src 下，生产镜像也 COPY 了整个 backend，因此 dist 运行时可回读 src。
 */
const migrationsDir = path.join(backendRoot, 'src/rag/migrations');

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      throw new Error(
        'Missing DATABASE_URL. Set it in .env.local (see .env.example).',
      );
    }
    pool = new Pool({ connectionString: url, max: 10 });
  }
  return pool;
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _rag_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function runMigrations(p: Pool): Promise<void> {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const client = await p.connect();
  try {
    await ensureMigrationsTable(client);

    for (const filename of files) {
      const applied = await client.query(
        `SELECT 1 FROM _rag_migrations WHERE filename = $1 LIMIT 1`,
        [filename],
      );
      if (applied.rowCount && applied.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO _rag_migrations (filename) VALUES ($1)`,
          [filename],
        );
        await client.query('COMMIT');
        logger.info('Applied RAG migration', { filename });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

/** 启用 pgvector 并执行待应用的 SQL 迁移。 */
export async function initPg(): Promise<void> {
  const p = getPool();
  await p.query('CREATE EXTENSION IF NOT EXISTS vector');
  await runMigrations(p);
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }
  const current = pool;
  pool = null;
  await current.end();
}

/** 测试用：强制关闭并清空单例。 */
export async function resetPoolForTests(): Promise<void> {
  await closePool();
}
