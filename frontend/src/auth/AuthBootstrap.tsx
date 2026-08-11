import { useEffect } from 'react';
import { App } from 'antd';
import { ApiCode } from '@ai-chat/shared';
import { fetchMe } from '@/apis/auth';
import { ApiError, userFacingApiMessage } from '@/apis/http/client';
import { setUnauthorizedHandler } from '@/apis/http/tokenBridge';
import { USE_MOCK } from '@/config/app';
import { useAuthStore } from '@/store/useAuthStore';
import { shouldForceLogoutOnBootMeFailure } from './bootSession';

/**
 * After persist hydrate: probe /api/auth/me when a token exists.
 * Leaves status as `unknown` until done so RequireAuth does not flash Chat.
 *
 * USE_MOCK: auth gate is skipped for UI-only demos (see RequireAuth). Documented
 * exception — do not combine with a real protected backend.
 */
export function AuthBootstrap() {
  const { message } = App.useApp();
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const token = useAuthStore((s) => s.token);
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  const setStatus = useAuthStore((s) => s.setStatus);
  const forceLogoutLocal = useAuthStore((s) => s.forceLogoutLocal);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    // Already resolved (e.g. login just succeeded) — skip re-entry loops.
    if (status !== 'unknown') {
      return;
    }

    let cancelled = false;

    async function boot() {
      if (USE_MOCK) {
        // UI mock path: no server session probe.
        if (!cancelled) {
          setStatus(token ? 'authenticated' : 'anonymous');
        }
        return;
      }

      if (!token) {
        if (!cancelled) {
          setStatus('anonymous');
        }
        return;
      }

      // Avoid double toast/navigate: boot handles me-failure itself.
      setUnauthorizedHandler(null);
      try {
        const me = await fetchMe();
        if (cancelled) {
          return;
        }
        setSession({
          token,
          username: me.username,
          expiresAt: me.expiresAt,
        });
      } catch (err) {
        if (cancelled) {
          return;
        }
        const expiresAt = useAuthStore.getState().expiresAt;
        if (shouldForceLogoutOnBootMeFailure(err, expiresAt)) {
          const msg = userFacingApiMessage(
            err,
            err instanceof ApiError && err.code === ApiCode.UNAUTHORIZED
              ? '登录已过期，请重新登录'
              : '登录已过期，请重新登录',
          );
          forceLogoutLocal({ reason: 'boot' });
          message.error(msg);
          return;
        }

        // Transient failure: keep persisted session so the user is not kicked out.
        setStatus('authenticated');
        message.warning(
          userFacingApiMessage(err, '登录状态校验失败，请稍后重试'),
        );
      } finally {
        setUnauthorizedHandler(() => {
          useAuthStore.getState().forceLogoutLocal({ reason: 'unauthorized' });
        });
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [
    hasHydrated,
    token,
    status,
    setSession,
    setStatus,
    forceLogoutLocal,
    message,
  ]);

  return null;
}
