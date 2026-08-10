import express from 'express';
import cors from 'cors';
import { createServer, type Server } from 'http';
import { WebSocketServer } from 'ws';
import { ConnectionManager } from './websocket/connectionManager.js';
import { handleMessage } from './websocket/handleMessage.js';
import { GenerationRunner } from './generation/generationRunner.js';
import { getChatStore } from './store/chatStore.js';
import { sendFail, sendSuccess } from './http/apiResponse.js';
import { logger } from './utils/logger.js';
import type { ServerEnv } from './config/env.js';
import { ApiCode } from '@ai-chat/shared';

export function createApp(env: ServerEnv): express.Application {
  const app = express();

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

  // Sidebar history: list conversations (newest first)
  app.get('/api/conversations', (_req, res) => {
    try {
      const store = getChatStore();
      const items = store.listConversations();
      sendSuccess(res, { items });
    } catch (error) {
      logger.error('Failed to list conversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，历史记录加载失败了，请稍后重试',
      });
    }
  });

  // Conversation messages with page / pageSize (page=1 = newest page)
  app.get('/api/conversations/:id/messages', (req, res) => {
    try {
      const conversationId = req.params.id;
      const store = getChatStore();
      if (!store.conversationExists(conversationId)) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个会话了',
        });
        return;
      }

      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      if (!Number.isFinite(page) || page < 1) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，页码不对，请换个页码再试',
          httpStatus: 400,
        });
        return;
      }
      if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，每页条数不对，请换个数量再试',
          httpStatus: 400,
        });
        return;
      }

      const result = store.listMessagesPage(conversationId, page, pageSize);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Failed to list conversation messages', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，消息加载失败了，请稍后重试',
      });
    }
  });

  return app;
}

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
  });
  const connectionManager = new ConnectionManager();
  const store = getChatStore();
  const orphaned = store.failOrphanedRunningGenerations();
  if (orphaned > 0) {
    logger.info('Marked orphaned generations as error', { count: orphaned });
  }
  const runner = new GenerationRunner(store, connectionManager);

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
        await handleMessage(raw, connection, connectionManager, runner);
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
      logger.info('Connection closed', {
        connectionId: connection.connectionId,
      });
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

    try {
      getChatStore().close();
    } catch {
      // ignore
    }

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
