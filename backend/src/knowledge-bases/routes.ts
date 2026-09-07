import { Router } from 'express';
import type { KnowledgeBase } from '@ai-chat/shared';
import { ApiCode, DOCUMENT_PAGE_SIZE } from '@ai-chat/shared';
import { requireAuth } from '../auth/middleware.js';
import { sendFail, sendSuccess } from '../http/apiResponse.js';
import { logger } from '../utils/logger.js';
import { getFileStorage } from '../documents/fileStorage.js';
import { ingestFile } from '../documents/ingestFile.js';
import {
  handleMultipartUpload,
  routeParam,
  sendPgUnavailable,
} from '../documents/multerUpload.js';
import {
  createKnowledgeBase,
  deleteForOwner,
  getByIdForOwner,
  listByOwner,
  updateForOwner,
  type KnowledgeBaseRow,
} from '../rag/knowledgeBaseStore.js';
import {
  listPageForKnowledgeBase,
  listStoragePathsForKnowledgeBase,
} from '../rag/pgDocumentStore.js';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;

function toPublicKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const name = raw.trim();
  if (!name || name.length > NAME_MAX) {
    return null;
  }
  return name;
}

function parseDescription(raw: unknown): string | null {
  if (raw === undefined) {
    return null;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const description = raw.trim();
  if (description.length > DESCRIPTION_MAX) {
    return null;
  }
  return description;
}

export function createKnowledgeBasesRouter(pgEnabled: boolean): Router {
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
      const rows = await listByOwner(ownerUsername);
      sendSuccess(res, { items: rows.map(toPublicKnowledgeBase) });
    } catch (error) {
      logger.error('Failed to list knowledge bases', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，知识库加载失败了，请稍后重试',
      });
    }
  });

  router.post('/', async (req, res) => {
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
      const name = parseName(req.body?.name);
      if (!name) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，知识库名称不对，请换个 1 到 100 字的名称',
          httpStatus: 400,
        });
        return;
      }
      let description = '';
      if (req.body?.description !== undefined) {
        const parsed = parseDescription(req.body.description);
        if (parsed === null) {
          sendFail(res, {
            code: ApiCode.BAD_REQUEST,
            msg: '哎呀，描述太长了，请缩短后再试',
            httpStatus: 400,
          });
          return;
        }
        description = parsed;
      }
      const row = await createKnowledgeBase(ownerUsername, name, description);
      sendSuccess(res, toPublicKnowledgeBase(row));
    } catch (error) {
      logger.error('Failed to create knowledge base', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，知识库创建失败了，请稍后重试',
      });
    }
  });

  router.get('/:id/documents', async (req, res) => {
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
      const kb = await getByIdForOwner(routeParam(req, 'id'), ownerUsername);
      if (!kb) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个知识库了',
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
      const result = await listPageForKnowledgeBase(ownerUsername, kb.id, {
        q,
        page,
        pageSize,
      });
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Failed to list knowledge base documents', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，资料加载失败了，请稍后重试',
      });
    }
  });

  router.post('/:id/documents', handleMultipartUpload, async (req, res) => {
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
      const kb = await getByIdForOwner(routeParam(req, 'id'), ownerUsername);
      if (!kb) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个知识库了',
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
      logger.error('Failed to upload knowledge base document', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，上传失败了，请稍后重试',
      });
    }
  });

  router.get('/:id', async (req, res) => {
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
      const kb = await getByIdForOwner(routeParam(req, 'id'), ownerUsername);
      if (!kb) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个知识库了',
        });
        return;
      }
      sendSuccess(res, toPublicKnowledgeBase(kb));
    } catch (error) {
      logger.error('Failed to get knowledge base', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，知识库加载失败了，请稍后重试',
      });
    }
  });

  router.patch('/:id', async (req, res) => {
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

      const patch: { name?: string; description?: string } = {};
      if (req.body?.name !== undefined) {
        const name = parseName(req.body.name);
        if (!name) {
          sendFail(res, {
            code: ApiCode.BAD_REQUEST,
            msg: '哎呀，知识库名称不对，请换个 1 到 100 字的名称',
            httpStatus: 400,
          });
          return;
        }
        patch.name = name;
      }
      if (req.body?.description !== undefined) {
        const description = parseDescription(req.body.description);
        if (description === null) {
          sendFail(res, {
            code: ApiCode.BAD_REQUEST,
            msg: '哎呀，描述太长了，请缩短后再试',
            httpStatus: 400,
          });
          return;
        }
        patch.description = description;
      }
      if (patch.name === undefined && patch.description === undefined) {
        sendFail(res, {
          code: ApiCode.BAD_REQUEST,
          msg: '哎呀，请至少修改名称或描述',
          httpStatus: 400,
        });
        return;
      }

      const updated = await updateForOwner(routeParam(req, 'id'), ownerUsername, patch);
      if (!updated) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个知识库了',
        });
        return;
      }
      sendSuccess(res, toPublicKnowledgeBase(updated));
    } catch (error) {
      logger.error('Failed to update knowledge base', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，知识库更新失败了，请稍后重试',
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

      const kb = await getByIdForOwner(routeParam(req, 'id'), ownerUsername);
      if (!kb) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个知识库了',
        });
        return;
      }

      const storagePaths = await listStoragePathsForKnowledgeBase(
        kb.id,
        ownerUsername,
      );
      const deleted = await deleteForOwner(kb.id, ownerUsername);
      if (!deleted) {
        sendFail(res, {
          code: ApiCode.NOT_FOUND,
          msg: '哎呀，找不到这个知识库了',
        });
        return;
      }

      const storage = getFileStorage();
      for (const relativePath of storagePaths) {
        storage.remove(relativePath);
      }
      sendSuccess(res, { id: kb.id });
    } catch (error) {
      logger.error('Failed to delete knowledge base', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      sendFail(res, {
        code: ApiCode.INTERNAL_ERROR,
        msg: '哎呀，知识库删除失败了，请稍后重试',
      });
    }
  });

  return router;
}
