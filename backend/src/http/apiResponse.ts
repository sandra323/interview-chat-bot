import type { Response } from 'express';
import { ApiCode, type ApiResponse } from '@ai-chat/shared';

/** Successful `/api/*` response. HTTP 200 + code 0. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  msg = 'success',
): void {
  const body: ApiResponse<T> = {
    code: ApiCode.SUCCESS,
    msg,
    data,
  };
  res.status(200).json(body);
}

/** Failed `/api/*` response. Non-zero code + user-facing msg; data is null. */
export function sendFail(
  res: Response,
  options: {
    code?: number;
    msg: string;
    /** HTTP status; defaults from common code mapping */
    httpStatus?: number;
  },
): void {
  const code = options.code ?? ApiCode.INTERNAL_ERROR;
  const httpStatus =
    options.httpStatus ??
    (code === ApiCode.BAD_REQUEST
      ? 400
      : code === ApiCode.UNAUTHORIZED
        ? 401
        : code === ApiCode.RATE_LIMITED
          ? 429
          : code === ApiCode.NOT_FOUND
            ? 404
            : 500);

  const body: ApiResponse<null> = {
    code,
    msg: options.msg,
    data: null,
  };
  res.status(httpStatus).json(body);
}
