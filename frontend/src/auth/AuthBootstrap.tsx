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
 * persist 恢复后：若存在 token 则探测 /api/auth/me。
 * 完成前保持 `unknown`，避免 RequireAuth 闪烁 Chat。
 *
 * USE_MOCK：纯 UI 演示跳过鉴权门禁（见 RequireAuth）。已文档化的
 * 例外 —— 勿与真实受保护后端混用。
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
    // 已解析（如刚登录成功）—— 跳过重复进入循环。
    if (status !== 'unknown') {
      return;
    }

    let cancelled = false;

    async function boot() {
      if (USE_MOCK) {
        // UI mock 路径：不探测服务端会话。
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

      // 避免重复 toast/导航：boot 自行处理 me 失败。
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

        // 瞬时失败：保留持久化会话，避免踢出用户。
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
