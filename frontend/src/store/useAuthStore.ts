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
  setSession: (session: AuthSession) => void;
  clearAuth: () => void;
  /**
   * Clear auth persist + wipe local chat UI state (not server history).
   * Used by logout / 401 / expiry. Optional navigate via registered callback.
   */
  forceLogoutLocal: (options?: { reason?: string }) => void;
  /** After reading persist: authenticated if token present, else anonymous. */
  markBootstrappedFromStorage: () => void;
  setStatus: (status: AuthStatus) => void;
}

type ForceLogoutListener = (info: { reason?: string }) => void;

const forceLogoutListeners = new Set<ForceLogoutListener>();

/** Register UI side-effects (e.g. navigate to /login) without importing router here. */
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
            // ignore listener errors
          }
        }
      },

      markBootstrappedFromStorage: () => {
        const { token } = get();
        set({ status: token ? 'authenticated' : 'anonymous' });
      },

      setStatus: (status) => set({ status }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markBootstrappedFromStorage();
      },
    },
  ),
);

// Wire HTTP client without circular imports through the bridge.
setAccessTokenGetter(() => useAuthStore.getState().token);
setUnauthorizedHandler(() => {
  useAuthStore.getState().forceLogoutLocal({ reason: 'unauthorized' });
});
