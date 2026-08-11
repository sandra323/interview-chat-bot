import { ApiCode, type ApiResponse } from '@ai-chat/shared';
import {
  getAccessToken,
  notifyUnauthorized,
} from './tokenBridge';

export class ApiError extends Error {
  readonly code: number;

  constructor(code: number, msg: string) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Prefer server msg; otherwise fixed Chinese fallback. */
export function userFacingApiMessage(
  err: unknown,
  fallback: string,
): string {
  if (err instanceof ApiError && err.message.trim()) {
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

function buildHeaders(
  extra?: Record<string, string>,
  withJsonBody = false,
): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extra,
  };
  if (withJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Shared unwrap for `/api/*` responses.
 * Throws ApiError when code !== 0 or data is null.
 * Triggers unauthorized cleanup only if this request carried a Bearer token.
 */
async function unwrapApiResponse<T>(
  response: Response,
  sentBearer: boolean,
): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      ApiCode.INTERNAL_ERROR,
      '哎呀，服务器返回格式不对，请稍后重试',
    );
  }

  if (body.code !== ApiCode.SUCCESS || body.data === null) {
    const msg =
      typeof body.msg === 'string' && body.msg.trim()
        ? body.msg
        : '哎呀，请求失败了，请稍后重试';

    if (body.code === ApiCode.UNAUTHORIZED && sentBearer) {
      notifyUnauthorized();
    }

    throw new ApiError(body.code, msg);
  }

  return body.data;
}

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const sentBearer = Boolean(getAccessToken());
  const response = await fetch(path, init);
  return unwrapApiResponse<T>(response, sentBearer);
}

/**
 * GET helper for `/api/*` routes (Vite proxies `/api` → backend in dev).
 * Unwraps `{ code, msg, data }` — throws ApiError when code !== 0.
 */
export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: 'GET',
    headers: buildHeaders(),
  });
}

/** POST helper — JSON body */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify(body),
  });
}

/** PATCH helper — JSON body */
export async function apiPatch<T>(
  path: string,
  body: unknown,
): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify(body),
  });
}

/** DELETE helper */
export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
}
