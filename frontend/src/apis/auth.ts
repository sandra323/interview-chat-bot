import { ApiCode } from '@ai-chat/shared';
import {
  ApiError,
  apiGet,
  apiPost,
  userFacingApiMessage,
} from './http/client';

export const AUTH_FALLBACK_LOGIN = '登录失败，请稍后重试';
export const AUTH_FALLBACK_NETWORK = '网络异常，请检查连接后重试';
export const AUTH_FALLBACK_ME = '登录状态校验失败，请稍后重试';

export interface AuthSessionPayload {
  token: string;
  username: string;
  expiresAt: number;
}

export interface AuthMePayload {
  username: string;
  expiresAt: number;
}

export async function login(
  username: string,
  password: string,
): Promise<AuthSessionPayload> {
  try {
    return await apiPost<AuthSessionPayload>('/api/auth/login', {
      username,
      password,
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ApiError(ApiCode.INTERNAL_ERROR, AUTH_FALLBACK_NETWORK);
    }
    throw new ApiError(
      err instanceof ApiError ? err.code : ApiCode.INTERNAL_ERROR,
      userFacingApiMessage(err, AUTH_FALLBACK_LOGIN),
    );
  }
}

export async function fetchMe(): Promise<AuthMePayload> {
  try {
    return await apiGet<AuthMePayload>('/api/auth/me');
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ApiError(ApiCode.INTERNAL_ERROR, AUTH_FALLBACK_NETWORK);
    }
    throw new ApiError(
      err instanceof ApiError ? err.code : ApiCode.INTERNAL_ERROR,
      userFacingApiMessage(err, AUTH_FALLBACK_ME),
    );
  }
}

/** Best-effort logout with one retry; server is idempotent. */
export async function logout(): Promise<{ ok: true }> {
  const attempt = async (): Promise<{ ok: true }> => {
    try {
      return await apiPost<{ ok: true }>('/api/auth/logout', {});
    } catch (err) {
      if (err instanceof TypeError) {
        throw new ApiError(ApiCode.INTERNAL_ERROR, AUTH_FALLBACK_NETWORK);
      }
      throw new ApiError(
        err instanceof ApiError ? err.code : ApiCode.INTERNAL_ERROR,
        userFacingApiMessage(err, '退出登录失败，请稍后重试'),
      );
    }
  };

  try {
    return await attempt();
  } catch {
    // One retry for transient network / 5xx before caller clears local state.
    return await attempt();
  }
}
