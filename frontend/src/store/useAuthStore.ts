import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  setAccessTokenGetter,
  setUnauthorizedHandler,
} from '@/apis/http/tokenBridge';
import { useChatStore } from './useChatStore';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface AuthSession {
  token: string;
  username: string;
  expiresAt: number;
}

interface AuthState {
  token: string | null;
  username: string | null;
  expiresAt: number | null;
  status: AuthStatus;
  _hasHydrated: boolean;
  setSession: (session: AuthSession) => void;
  clearAuth: () => void;
  /**
   * 清除 auth persist 并清空本地聊天 UI 状态（非服务端历史）。
   * 用于退出 / 401 / 过期。可选通过注册回调导航。
   */
  forceLogoutLocal: (options?: { reason?: string }) => void;
  setStatus: (status: AuthStatus) => void;
  setHasHydrated: (value: boolean) => void;
}

type ForceLogoutListener = (info: { reason?: string }) => void;

const forceLogoutListeners = new Set<ForceLogoutListener>();

/** 注册 UI 副作用（如导航至 /login），无需在此导入 router。 */
export function onForceLogoutLocal(listener: ForceLogoutListener): () => void {
  forceLogoutListeners.add(listener);
  return () => {
    forceLogoutListeners.delete(listener);
  };
}

export const AUTH_STORAGE_KEY = 'ai-chat-auth-v1';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      expiresAt: null,
      status: 'unknown',
      _hasHydrated: false,

      setSession: (session) =>
        set({
          token: session.token,
          username: session.username,
          expiresAt: session.expiresAt,
          status: 'authenticated',
        }),

      clearAuth: () =>
        set({
          token: null,
          username: null,
          expiresAt: null,
          status: 'anonymous',
        }),

      forceLogoutLocal: (options) => {
        get().clearAuth();
        const chat = useChatStore.getState();
        chat.clearChat();
        chat.setLoading(false);
        useChatStore.setState({ generatingConversationIds: [] });
        for (const listener of forceLogoutListeners) {
          try {
            listener({ reason: options?.reason });
          } catch {
            // 忽略 listener 错误
          }
        }
      },

      setStatus: (status) => set({ status }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        // 保持 status 为 `unknown`，直至 AuthBootstrap 完成 /api/auth/me。
        state?.setHasHydrated(true);
      },
    },
  ),
);

// 通过 bridge 连接 HTTP client，避免循环导入。
setAccessTokenGetter(() => useAuthStore.getState().token);
setUnauthorizedHandler(() => {
  useAuthStore.getState().forceLogoutLocal({ reason: 'unauthorized' });
});
