import { ApiCode } from '@ai-chat/shared';
import { ApiError } from '@/apis/http/client';

/**
 * 判断启动时 `/me` 失败是否应清除本地会话。
 * 仅在真实鉴权拒绝或已知客户端过期时清除 ——
 * 瞬时网络 / 5xx 保留 token，以便刷新后恢复。
 */
export function shouldForceLogoutOnBootMeFailure(
  err: unknown,
  expiresAt: number | null,
  now: number = Date.now(),
): boolean {
  if (err instanceof ApiError && err.code === ApiCode.UNAUTHORIZED) {
    return true;
  }
  if (expiresAt != null && expiresAt <= now) {
    return true;
  }
  return false;
}
