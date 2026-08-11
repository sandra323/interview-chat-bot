import type { Request } from 'express';

/** Best-effort client IP (use Express `trust proxy` behind a reverse proxy). */
export function getClientIp(req: Request): string {
  const fromExpress = typeof req.ip === 'string' ? req.ip.trim() : '';
  if (fromExpress) {
    return fromExpress;
  }
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress?.trim() || 'unknown';
}
