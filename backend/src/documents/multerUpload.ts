import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ApiCode, DOCUMENT_MAX_BYTES } from '@ai-chat/shared';
import { sendFail } from '../http/apiResponse.js';
import { logger } from '../utils/logger.js';

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
  defParamCharset: 'utf8',
});

export function handleMultipartUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  documentUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      sendFail(res, {
        code: ApiCode.BAD_REQUEST,
        msg: '哎呀，文件太大了，请上传 20MB 以内的文件',
        httpStatus: 400,
      });
      return;
    }
    if (err) {
      logger.error('Document upload multer error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.BAD_REQUEST,
        msg: '哎呀，上传失败了，请稍后重试',
        httpStatus: 400,
      });
      return;
    }
    next();
  });
}

export function sendPgUnavailable(res: Response): void {
  sendFail(res, {
    code: ApiCode.INTERNAL_ERROR,
    msg: '哎呀，知识库服务未启用，请稍后重试',
    httpStatus: 503,
  });
}

export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}
