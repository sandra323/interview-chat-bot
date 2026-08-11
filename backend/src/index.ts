import { createServer } from 'http';
import {
  assertAuthCredentials,
  assertLlmCredentials,
  loadEnvFiles,
  readServerEnv,
} from './config/env.js';
import { createApp, attachWebSocketServer, setupGracefulShutdown } from './server.js';
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

const app = createApp(env);
const server = createServer(app);
const wss = attachWebSocketServer(server);

setupGracefulShutdown(server, wss);

server.listen(env.port, () => {
  logger.info(`Server listening on port ${env.port}`, {
    defaultModel: env.defaultModel,
    llmApiUrl: env.llmApiUrl,
    // never log api key
  });
});
