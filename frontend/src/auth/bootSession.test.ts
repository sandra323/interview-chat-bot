import { describe, expect, it } from 'vitest';
import { ApiCode } from '@ai-chat/shared';
import { ApiError } from '@/apis/http/client';
import { shouldForceLogoutOnBootMeFailure } from './bootSession';

describe('shouldForceLogoutOnBootMeFailure', () => {
  const future = Date.now() + 60_000;
  const past = Date.now() - 1_000;

  it('logs out on UNAUTHORIZED', () => {
    expect(
      shouldForceLogoutOnBootMeFailure(
        new ApiError(ApiCode.UNAUTHORIZED, '登录已过期，请重新登录'),
        future,
      ),
    ).toBe(true);
  });

  it('keeps session on network / 5xx when expiresAt still valid', () => {
    expect(
      shouldForceLogoutOnBootMeFailure(
        new ApiError(ApiCode.INTERNAL_ERROR, '网络异常，请检查连接后重试'),
        future,
      ),
    ).toBe(false);
    expect(
      shouldForceLogoutOnBootMeFailure(new TypeError('Failed to fetch'), future),
    ).toBe(false);
  });

  it('logs out when client expiresAt already past', () => {
    expect(
      shouldForceLogoutOnBootMeFailure(
        new ApiError(ApiCode.INTERNAL_ERROR, '登录状态校验失败，请稍后重试'),
        past,
      ),
    ).toBe(true);
  });
});
