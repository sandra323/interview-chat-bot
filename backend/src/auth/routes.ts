import { Router } from 'express';
import { ApiCode } from '@ai-chat/shared';
import type { ServerEnv } from '../config/env.js';
import { sendFail, sendSuccess } from '../http/apiResponse.js';
import { logger } from '../utils/logger.js';
import { extractBearerToken } from './bearer.js';
import { verifyDemoCredentials } from './credentials.js';
import { resolveBearerSession } from './resolveSession.js';
import { getAuthSessionStore } from './sessionStore.js';

/**
 * Auth HTTP routes.
 * Logout without a valid Bearer is still SUCCESS (idempotent) — client may
 * clear local state even when the server session is already gone.
 */
export function createAuthRouter(env: ServerEnv): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      const check = await verifyDemoCredentials({
        username: req.body?.username,
        password: req.body?.password,
        expectedUsername: env.authUsername,
        passwordHash: env.authPasswordHash,
      });

      if (!check.ok) {
        if (check.reason === 'empty') {
          sendFail(res, {
            code: ApiCode.BAD_REQUEST,
            msg: '请输入账号和密码',
          });
          return;
        }
        if (check.reason === 'too_long') {
          sendFail(res, {
            code: ApiCode.BAD_REQUEST,
            msg: '账号或密码过长',
          });
          return;
        }
        logger.warn('Auth login failed', { reason: 'credentials' });
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '账号或密码错误',
        });
        return;
      }

      const session = getAuthSessionStore().createSession(
        check.username,
        env.authSessionTtlHours,
      );

      logger.info('Auth login success', { username: session.username });
      sendSuccess(res, {
        token: session.token,
        username: session.username,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      logger.error('Auth login error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '登录失败，请稍后重试',
      });
    }
  });

  router.get('/me', (req, res) => {
    try {
      const result = resolveBearerSession(extractBearerToken(req));
      if (!result.ok) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: result.msg,
        });
        return;
      }
      sendSuccess(res, {
        username: result.auth.username,
        expiresAt: result.auth.expiresAt,
      });
    } catch (error) {
      logger.error('Auth me error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '登录状态校验失败，请稍后重试',
      });
    }
  });

  router.post('/logout', (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (token) {
        const revoked = getAuthSessionStore().revokeByToken(token);
        if (revoked) {
          logger.info('Auth session revoked');
        }
      }
      // Idempotent: missing/invalid token still succeeds.
      sendSuccess(res, { ok: true });
    } catch (error) {
      logger.error('Auth logout error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '退出登录失败，请稍后重试',
      });
    }
  });

  return router;
}
