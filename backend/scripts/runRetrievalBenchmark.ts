import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFiles } from '../src/config/env.js';
import { initPg, resetPoolForTests } from '../src/rag/pg.js';
import {
  isSafeTestDatabaseUrl,
  resolvePgTestDatabaseUrl,
} from '../src/rag/__tests__/testDatabase.js';
import { formatReport, runBenchmark, sweepLiveFactors } from '../src/rag/benchmark/run.js';
import { EmbedQuotaError } from '../src/rag/ingestErrors.js';

const reportsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/rag/benchmark/reports',
);

function readMode(argv: string[]): 'offline' | 'live' {
  const index = argv.indexOf('--mode');
  const value = index >= 0 ? argv[index + 1] : 'offline';
  if (value === 'live' || value === 'offline') {
    return value;
  }
  throw new Error('Usage: --mode offline|live');
}

async function main(): Promise<void> {
  loadEnvFiles();
  const mode = readMode(process.argv.slice(2));
  const testUrl = resolvePgTestDatabaseUrl();
  if (!testUrl || !isSafeTestDatabaseUrl(testUrl)) {
    if (mode === 'offline') {
      console.log('skipped: no-test-database');
      return;
    }
    console.error('需要 *_test 库。禁止连接业务库 interview_chat。');
    process.exit(1);
  }

  if (mode === 'live' && !process.env.OPENAI_API_KEY?.trim()) {
    console.log('skipped: no-openai-key');
    return;
  }

  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testUrl;
  try {
    await initPg();
    const sweep = mode === 'live' && process.argv.includes('--sweep');
    const text = sweep
      ? await sweepLiveFactors()
      : formatReport(await runBenchmark({ mode }));
    console.log(text);
    fs.mkdirSync(reportsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(reportsDir, `${mode}-${stamp}.txt`), text);
  } catch (error) {
    if (error instanceof EmbedQuotaError) {
      console.error('aborted: openai-quota');
      process.exit(1);
    }
    throw error;
  } finally {
    await resetPoolForTests();
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
