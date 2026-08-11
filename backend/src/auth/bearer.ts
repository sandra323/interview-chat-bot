import type { Request } from 'express';

/** Parse `Authorization: Bearer <token>`. Returns null if missing/malformed. */
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
