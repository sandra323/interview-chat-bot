import { Pool } from 'pg';

const TEST_DB_NAME_RE = /_test$/;

export function databaseNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

export function isSafeTestDatabaseUrl(url: string): boolean {
  const name = databaseNameFromUrl(url);
  return Boolean(name) && TEST_DB_NAME_RE.test(name);
}

export function toTestDatabaseUrl(url: string): string {
  if (isSafeTestDatabaseUrl(url)) {
    return url;
  }
  const parsed = new URL(url);
  const current = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  parsed.pathname = `/${current}_test`;
  return parsed.toString();
}

export function adminDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

/** 仅当目标库名以 `_test` 结尾时建库；禁止对业务库做破坏性操作。 */
export async function ensureTestDatabase(testUrl: string): Promise<void> {
  if (!isSafeTestDatabaseUrl(testUrl)) {
    throw new Error(
      `Refusing to prepare a non-test database (${databaseNameFromUrl(testUrl) || 'unknown'}). Use a name ending with _test.`,
    );
  }
  const dbName = databaseNameFromUrl(testUrl);
  const admin = new Pool({ connectionString: adminDatabaseUrl(testUrl) });
  try {
    const found = await admin.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
      [dbName],
    );
    if (!found.rows[0]?.exists) {
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    }
  } finally {
    await admin.end();
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
  return `"${name}"`;
}

/**
 * 解析集成测试用 URL：优先 TEST_DATABASE_URL，否则把 DATABASE_URL 改成 *_test。
 * 非测试库名一律视为未配置（跳过测试），避免 TRUNCATE 业务数据。
 */
export function resolvePgTestDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.TEST_DATABASE_URL?.trim() ?? '';
  if (explicit) {
    return isSafeTestDatabaseUrl(explicit) ? explicit : '';
  }
  const raw = env.DATABASE_URL?.trim() ?? '';
  if (!raw) {
    return '';
  }
  if (isSafeTestDatabaseUrl(raw)) {
    return raw;
  }
  return toTestDatabaseUrl(raw);
}
