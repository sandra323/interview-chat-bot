import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiCode } from '@ai-chat/shared';
import {
  getAccessToken,
  notifyUnauthorized,
  setAccessTokenGetter,
  setUnauthorizedHandler,
} from '@/apis/http/tokenBridge';
import { ApiError, userFacingApiMessage } from '@/apis/http/client';
import { AUTH_STORAGE_KEY, useAuthStore } from './useAuthStore';
import { createMessage, useChatStore } from './useChatStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState({
      token: null,
      username: null,
      expiresAt: null,
      status: 'anonymous',
    });
    useChatStore.setState({
      messages: [],
      conversationId: null,
      conversationTitle: null,
      model: 'deepseek-v4-flash',
      ui: { loading: false, error: null, connectionStatus: 'closed' },
      generatingConversationIds: [],
      _hasHydrated: true,
    });
    setAccessTokenGetter(() => useAuthStore.getState().token);
    setUnauthorizedHandler(() => {
      useAuthStore.getState().forceLogoutLocal({ reason: 'unauthorized' });
    });
  });

  it('setSession stores token and marks authenticated', () => {
    useAuthStore.getState().setSession({
      token: 'tok',
      username: 'demo',
      expiresAt: Date.now() + 60_000,
    });
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(getAccessToken()).toBe('tok');
  });

  it('clearAuth removes token and marks anonymous', () => {
    useAuthStore.getState().setSession({
      token: 'tok',
      username: 'demo',
      expiresAt: Date.now() + 60_000,
    });
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(getAccessToken()).toBeNull();
  });

  it('forceLogoutLocal clears auth and chat client state', () => {
    useAuthStore.getState().setSession({
      token: 'tok',
      username: 'demo',
      expiresAt: Date.now() + 60_000,
    });
    useChatStore.getState().addMessage(createMessage('user', 'hi'));
    useChatStore.getState().setConversationId('c1');
    useChatStore.getState().setConversationTitle('标题');

    useAuthStore.getState().forceLogoutLocal({ reason: 'logout' });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().conversationId).toBeNull();
    expect(useChatStore.getState().conversationTitle).toBeNull();
  });

  it('unauthorized notify triggers forceLogoutLocal', () => {
    useAuthStore.getState().setSession({
      token: 'tok',
      username: 'demo',
      expiresAt: Date.now() + 60_000,
    });
    useChatStore.getState().addMessage(createMessage('user', 'hi'));

    notifyUnauthorized();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});

describe('userFacingApiMessage', () => {
  it('prefers ApiError message then fallback', () => {
    expect(
      userFacingApiMessage(
        new ApiError(ApiCode.UNAUTHORIZED, '账号或密码错误'),
        '登录失败，请稍后重试',
      ),
    ).toBe('账号或密码错误');
    expect(userFacingApiMessage(null, '登录失败，请稍后重试')).toBe(
      '登录失败，请稍后重试',
    );
  });
});

describe('tokenBridge unauthorized only with handler', () => {
  it('does not throw when handler unset', () => {
    setUnauthorizedHandler(null);
    expect(() => notifyUnauthorized()).not.toThrow();
  });

  it('invokes handler once', () => {
    const spy = vi.fn();
    setUnauthorizedHandler(spy);
    notifyUnauthorized();
    expect(spy).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });
});
