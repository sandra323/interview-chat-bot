import { createServer } from 'http';
import { createApp, attachWebSocketServer, setupGracefulShutdown } from './server.js';
import { logger } from './utils/logger.js';

const PORT = Number(process.env.PORT) || 3001;

const app = createApp();
const server = createServer(app);
const wss = attachWebSocketServer(server);

setupGracefulShutdown(server, wss);

server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});
