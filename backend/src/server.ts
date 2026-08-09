import express from 'express';
import cors from 'cors';
import { createServer, type Server } from 'http';
import { WebSocketServer } from 'ws';
import { ConnectionManager } from './websocket/connectionManager.js';
import { handleMessage } from './websocket/handleMessage.js';
import { logger } from './utils/logger.js';
import type { ServerEnv } from './config/env.js';

export function createApp(env: ServerEnv): express.Application {
  const app = express();

  // Dev: reflect request origin if unset. Prod: require explicit CORS_ORIGIN.
  const corsOptions =
    env.nodeEnv === 'production'
      ? {
          origin: env.corsOrigin?.split(',').map((s) => s.trim()) ?? false,
          credentials: true,
        }
      : env.corsOrigin
        ? {
            origin: env.corsOrigin.split(',').map((s) => s.trim()),
            credentials: true,
          }
        : undefined;

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      llmConfigured: Boolean(env.llmApiKey),
    });
  });

  return app;
}

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    // Chat frames are text-only now; keep payload small
    maxPayload: 64 * 1024,
  });
  const connectionManager = new ConnectionManager();

  wss.on('connection', (ws) => {
    const connection = connectionManager.addConnection(ws);
    logger.info('Connection opened', { connectionId: connection.connectionId });

    ws.send(
      JSON.stringify({
        type: 'connected',
        connectionId: connection.connectionId,
      }),
    );

    ws.on('message', async (data) => {
      try {
        const raw = data.toString();
        await handleMessage(raw, connection, connectionManager);
      } catch (error) {
        logger.error('Unhandled message handler error', {
          connectionId: connection.connectionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        if (ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'error',
              code: 'INTERNAL_ERROR',
              message: '哎呀，页面开小差了，请稍后重试',
            }),
          );
        }
      }
    });

    ws.on('close', () => {
      connectionManager.removeConnection(connection.connectionId);
      logger.info('Connection closed', { connectionId: connection.connectionId });
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        connectionId: connection.connectionId,
        error: error.message,
      });
    });
  });

  return wss;
}

export function setupGracefulShutdown(
  server: Server,
  wss: WebSocketServer,
): void {
  const shutdown = () => {
    logger.info('Shutting down gracefully');

    wss.clients.forEach((client) => {
      client.close();
    });

    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
