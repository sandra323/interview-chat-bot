import { Router } from 'express';
import multer from 'multer';
import { ApiCode, DOCUMENT_MAX_BYTES, DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';
import { requireAuth } from '../auth/middleware.js';
import { sendFail, sendSuccess } from '../http/apiResponse.js';
import { logger } from '../utils/logger.js';
import { getDocumentStore } from './documentStore.js';
import { getFileStorage } from './fileStorage.js';
import { ingestFile } from './ingestFile.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
  defParamCharset: 'utf8',
});

function contentDispositionInline(filename: string): string {
  const asciiFallback =
    filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'file';
  const encoded = encodeURIComponent(filename);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function createDocumentsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    try {
      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? DOCUMENT_PAGE_SIZE);
      if (!Number.isFinite(page) || page < 1) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，页码不对，请换个页码再试',
          httpStatus: 400,
        });
        return;
      }
      if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，每页条数不对，请换个数量再试',
          httpStatus: 400,
        });
        return;
      }

      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const result = getDocumentStore().listPage(ownerUsername, {
        q,
        page,
        pageSize,
      });
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Failed to list documents', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，资料加载失败了，请稍后重试',
      });
    }
  });

  router.post('/', (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
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
  }, (req, res) => {
    try {
      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const file = req.file;
      if (!file) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，请先选择要上传的文件',
          httpStatus: 400,
        });
        return;
      }

      const result = ingestFile({
        ownerUsername,
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
      if (!result.ok) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: result.msg,
          httpStatus: 400,
        });
        return;
      }

      sendSuccess(res, result.document);
    } catch (error) {
      logger.error('Failed to upload document', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，上传失败了，请稍后重试',
      });
    }
  });

  router.get('/:id/content', (req, res) => {
    try {
      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const doc = getDocumentStore().getByIdForOwner(
        req.params.id,
        ownerUsername,
      );
      if (!doc || doc.status !== 'ready') {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个文件了',
        });
        return;
      }

      const storage = getFileStorage();
      if (!storage.exists(doc.storagePath)) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个文件了',
        });
        return;
      }

      const absPath = storage.resolve(doc.storagePath);
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader(
        'Content-Disposition',
        contentDispositionInline(doc.filename),
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.sendFile(absPath);
    } catch (error) {
      logger.error('Failed to read document content', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，文件预览失败了，请稍后重试',
      });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const deleted = getDocumentStore().deleteByIdForOwner(
        req.params.id,
        ownerUsername,
      );
      if (!deleted) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个文件了',
        });
        return;
      }

      getFileStorage().remove(deleted.storagePath);
      sendSuccess(res, { id: deleted.id });
    } catch (error) {
      logger.error('Failed to delete document', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，删除失败了，请稍后重试',
      });
    }
  });

  return router;
}
