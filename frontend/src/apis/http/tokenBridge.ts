/**
 * Tiny bridge so HTTP client can read the access token / fire 401 cleanup
 * without importing the Zustand auth store (avoids circular deps).
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

/** Notify only when an authenticated request was rejected (handler decides cleanup). */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
