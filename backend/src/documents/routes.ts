import { Router } from 'express';
import { ApiCode, DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';
import { requireAuth } from '../auth/middleware.js';
import { sendFail, sendSuccess } from '../http/apiResponse.js';
import { logger } from '../utils/logger.js';
import { getFileStorage } from './fileStorage.js';
import { ingestFile } from './ingestFile.js';
import { kindFromFilename } from './validateUpload.js';
import { handleMultipartUpload, routeParam, sendPgUnavailable } from './multerUpload.js';
import { enqueueIngest } from '../rag/ingestWorker.js';
import { getOrCreateDefaultForOwner } from '../rag/knowledgeBaseStore.js';
import {
  deleteByIdForOwner,
  getByIdForOwner,
  listPageForOwner,
  toPublicDocument,
  updateStatus,
} from '../rag/pgDocumentStore.js';

function contentDispositionInline(filename: string): string {
  const asciiFallback =
    filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'file';
  const encoded = encodeURIComponent(filename);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function createDocumentsRouter(pgEnabled: boolean): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    try {
      if (!pgEnabled) {
        sendPgUnavailable(res);
        return;
      }

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
      const result = await listPageForOwner(ownerUsername, {
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

  router.post('/', handleMultipartUpload, async (req, res) => {
    try {
      if (!pgEnabled) {
        sendPgUnavailable(res);
        return;
      }

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

      const kb = await getOrCreateDefaultForOwner(ownerUsername);
      const result = await ingestFile({
        ownerUsername,
        knowledgeBaseId: kb.id,
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

  router.get('/:id/content', async (req, res) => {
    try {
      if (!pgEnabled) {
        sendPgUnavailable(res);
        return;
      }

      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const doc = await getByIdForOwner(routeParam(req, 'id'), ownerUsername);
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


  router.post('/:id/reprocess', async (req, res) => {
    try {
      if (!pgEnabled) {
        sendPgUnavailable(res);
        return;
      }

      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const doc = await getByIdForOwner(routeParam(req, 'id'), ownerUsername);
      if (!doc) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个文件了',
        });
        return;
      }

      if (
        doc.status === 'pending' ||
        doc.status === 'processing' ||
        doc.status === 'uploading'
      ) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '文件正在处理，请稍后再试',
          httpStatus: 400,
        });
        return;
      }

      const parsed = kindFromFilename(doc.filename);
      if (!parsed) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，文件解析失败了，请换个文件再试',
          httpStatus: 400,
        });
        return;
      }

      const pending = await updateStatus(doc.id, ownerUsername, {
        status: 'pending',
        progress: 0,
        error: null,
      });
      if (!pending) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个文件了',
        });
        return;
      }
      enqueueIngest({
        documentId: doc.id,
        ownerUsername,
        kind: parsed.kind,
      });
      sendSuccess(res, toPublicDocument(pending));
    } catch (error) {
      logger.error('Failed to reprocess document', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，处理失败了，请稍后重试',
      });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!pgEnabled) {
        sendPgUnavailable(res);
        return;
      }

      const ownerUsername = req.auth?.username;
      if (!ownerUsername) {
        sendFail(res, {
          code: ApiCode.UNAUTHORIZED,
          msg: '请先登录',
        });
        return;
      }

      const deleted = await deleteByIdForOwner(routeParam(req, 'id'), ownerUsername);
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
