import { ApiCode, type ApiResponse } from '@ai-chat/shared';

/**
 * GET helper for `/api/*` routes (Vite proxies `/api` → backend in dev).
 * Unwraps `{ code, msg, data }` — throws Error(msg) when code !== 0.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

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
