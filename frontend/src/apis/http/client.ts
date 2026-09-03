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

/** 优先使用服务端 msg；否则使用固定中文兜底。 */
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
 * `/api/*` 响应的共享解包。
 * code !== 0 或 data 为 null 时抛出 ApiError。
 * 仅在本请求携带 Bearer token 时触发未授权清理。
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

function unwrapJsonBody<T>(
  raw: unknown,
  sentBearer: boolean,
): T {
  const body = raw as ApiResponse<T>;
  if (!body || typeof body !== 'object') {
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

/**
 * multipart 上传，通过 XHR 回报 0–100 进度。
 * 不要手动设置 Content-Type，浏览器会带上 boundary。
 */
export function apiUpload<T>(
  path: string,
  formData: FormData,
  options?: {
    onProgress?: (percent: number) => void;
  },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const sentBearer = Boolean(getAccessToken());
    xhr.open('POST', path);
    xhr.setRequestHeader('Accept', 'application/json');
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(
        0,
        Math.min(100, Math.round((event.loaded / event.total) * 100)),
      );
      options?.onProgress?.(percent);
    };

    xhr.onload = () => {
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        const data = unwrapJsonBody<T>(parsed, sentBearer);
        options?.onProgress?.(100);
        resolve(data);
      } catch (error) {
        if (error instanceof ApiError) {
          reject(error);
          return;
        }
        reject(
          new ApiError(
            ApiCode.INTERNAL_ERROR,
            '哎呀，服务器返回格式不对，请稍后重试',
          ),
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new ApiError(ApiCode.INTERNAL_ERROR, '哎呀，上传失败了，请稍后重试'),
      );
    };

    xhr.send(formData);
  });
}

/** 拉取二进制内容（资料库预览）。成功响应不是 `{ code, msg, data }` 封装。 */
export async function apiGetBlob(
  path: string,
): Promise<{ blob: Blob; contentType: string }> {
  const sentBearer = Boolean(getAccessToken());
  const response = await fetch(path, {
    method: 'GET',
    headers: buildHeaders(),
  });
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    await unwrapApiResponse<never>(response, sentBearer);
  }

  if (!response.ok) {
    throw new ApiError(
      ApiCode.INTERNAL_ERROR,
      '哎呀，文件预览失败了，请稍后重试',
    );
  }

  return { blob: await response.blob(), contentType };
}

/**
 * `/api/*` 路由的 GET 辅助（开发时 Vite 将 `/api` 代理至 backend）。
 * 解包 `{ code, msg, data }` —— code !== 0 时抛出 ApiError。
 */
export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: 'GET',
    headers: buildHeaders(),
  });
}

/** POST 辅助 —— JSON body */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify(body),
  });
}

/** PATCH 辅助 —— JSON body */
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

/** DELETE 辅助 */
export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
}
