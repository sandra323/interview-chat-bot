import { createServer } from 'http';
import {
  assertAuthCredentials,
  assertLlmCredentials,
  loadEnvFiles,
  readServerEnv,
} from './config/env.js';
import { createApp, attachWebSocketServer, setupGracefulShutdown } from './server.js';
import { initPg } from './rag/pg.js';
import { migrateDocumentsFromSqlite } from './rag/migrateDocuments.js';
import { resumeIncompleteParses } from './rag/parseWorker.js';
import { logger } from './utils/logger.js';

loadEnvFiles();

const env = readServerEnv();

try {
  assertLlmCredentials(env);
  assertAuthCredentials(env);
} catch (error) {
  logger.error(error instanceof Error ? error.message : 'Invalid server env');
  process.exit(1);
}

if (env.databaseUrl) {
  try {
    await initPg();
    logger.info('PostgreSQL + pgvector initialized');
    await migrateDocumentsFromSqlite();
    await resumeIncompleteParses();
  } catch (error) {
    logger.error('Failed to init PostgreSQL', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
} else {
  logger.info('DATABASE_URL not set; skipping PostgreSQL / RAG init');
}

const app = createApp(env);
const server = createServer(app);
const wss = attachWebSocketServer(server);

setupGracefulShutdown(server, wss);

server.listen(env.port, () => {
  logger.info(`Server listening on port ${env.port}`, {
    defaultModel: env.defaultModel,
    llmApiUrl: env.llmApiUrl,
    // 切勿记录 API key
  });
});
