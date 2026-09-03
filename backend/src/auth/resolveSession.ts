import type { AuthSessionRow } from './sessionStore.js';
import { getAuthSessionStore } from './sessionStore.js';

export interface RequestAuth {
  username: string;
  expiresAt: number;
  sessionId: string;
}

export type ResolveSessionResult =
  | { ok: true; auth: RequestAuth }
  | { ok: false; msg: string };

/**
 * 将原始 Bearer token 解析为有效会话，或返回中文 UNAUTHORIZED 消息。
 */
export function resolveBearerSession(
  rawToken: string | null,
  now: number = Date.now(),
): ResolveSessionResult {
  if (!rawToken) {
    return { ok: false, msg: '请先登录' };
  }

  const store = getAuthSessionStore();
  const valid = store.findValidByToken(rawToken, now);
  if (valid) {
    return {
      ok: true,
      auth: {
        username: valid.username,
        expiresAt: valid.expiresAt,
        sessionId: valid.id,
      },
    };
  }

  const any: AuthSessionRow | null = store.lookupByToken(rawToken);
  if (any && (any.revokedAt != null || any.expiresAt <= now)) {
    return { ok: false, msg: '登录已过期，请重新登录' };
  }

  return { ok: false, msg: '请先登录' };
}
