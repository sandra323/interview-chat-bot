/**
 * 轻量桥接：HTTP client 读取 access token / 触发 401 清理，
 * 无需导入 Zustand auth store（避免循环依赖）。
 */

type TokenGetter = () => string | null | undefined;
type UnauthorizedHandler = () => void;

let accessTokenGetter: TokenGetter = () => null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setAccessTokenGetter(getter: TokenGetter): void {
  accessTokenGetter = getter;
}

export function getAccessToken(): string | null {
  const token = accessTokenGetter();
  return token && token.length > 0 ? token : null;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** 仅在已认证请求被拒绝时通知（由 handler 决定清理逻辑）。 */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
