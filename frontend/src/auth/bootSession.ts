import { ApiCode } from '@ai-chat/shared';
import { ApiError } from '@/apis/http/client';

/**
 * Decide whether boot `/me` failure should wipe local session.
 * Only clear on real auth rejection or known client-side expiry —
 * transient network / 5xx keep the token so a refresh can recover.
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
