import type { Request } from 'express';

/** 解析 `Authorization: Bearer <token>`。缺失或格式错误时返回 null。 */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  return match[1] ?? null;
}
