import type { Request } from 'express';

/** 尽力获取客户端 IP（反向代理后需启用 Express `trust proxy`）。 */
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
