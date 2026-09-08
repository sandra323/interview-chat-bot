import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../../config/env.js';
import { runBenchmark } from '../benchmark/run.js';
import { initPg, resetPoolForTests } from '../pg.js';
import {
  ensureTestDatabase,
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from './testDatabase.js';

loadEnvFiles();
const previousDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = resolvePgTestDatabaseUrl();

describe.skipIf(!testDatabaseUrl)('offline retrieval benchmark protocol', () => {
  beforeAll(async () => {
    if (!isSafeTestDatabaseUrl(testDatabaseUrl)) {
      throw new Error('Refusing to run PG tests against a non-test database');
    }
    await ensureTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    await initPg();
  });

  afterAll(async () => {
    await resetPoolForTests();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('binds gold and scores without treating weak hits as a gate', async () => {
    const report = await runBenchmark({ mode: 'offline' });
    expect(report.invalidGold).toBe(0);
    expect(report.errors).toBe(0);
    expect(report.scoredCount).toBe(report.queryCount);
    expect(report.weakTotal).toBeGreaterThanOrEqual(4);
    expect(report.recallAt12).toBeGreaterThanOrEqual(report.recallAt5);
    const exact = report.queries.find((row) => row.id === 'q01');
    expect(exact?.status).toBe('ok');
    expect(exact?.rank).not.toBeNull();
  });
});
