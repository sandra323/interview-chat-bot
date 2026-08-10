import { ApiCode, type ApiResponse } from '@ai-chat/shared';

/**
 * Shared unwrap for `/api/*` responses.
 * Throws Error(msg) when code !== 0 or data is null.
 */
async function unwrapApiResponse<T>(response: Response): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error('哎呀，服务器返回格式不对，请稍后重试');
  }

  if (body.code !== ApiCode.SUCCESS || body.data === null) {
    throw new Error(body.msg || '哎呀，请求失败了，请稍后重试');
  }

  return body.data;
}

/**
 * GET helper for `/api/*` routes (Vite proxies `/api` → backend in dev).
 * Unwraps `{ code, msg, data }` — throws Error(msg) when code !== 0.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return unwrapApiResponse<T>(response);
}

/** PATCH helper — JSON body */
export async function apiPatch<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return unwrapApiResponse<T>(response);
}

/** DELETE helper */
export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return unwrapApiResponse<T>(response);
}
