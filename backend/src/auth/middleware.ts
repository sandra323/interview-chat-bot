import type { NextFunction, Request, Response } from 'express';
import { ApiCode } from '@ai-chat/shared';
import { sendFail } from '../http/apiResponse.js';
import { extractBearerToken } from './bearer.js';
import {
  resolveBearerSession,
  type RequestAuth,
} from './resolveSession.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: RequestAuth;
  }
}

/** Require a valid Bearer session; sets `req.auth` on success. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const result = resolveBearerSession(extractBearerToken(req));
  if (!result.ok) {
    sendFail(res, {
      code: ApiCode.UNAUTHORIZED,
      msg: result.msg,
    });
    return;
  }
  req.auth = result.auth;
  next();
}
