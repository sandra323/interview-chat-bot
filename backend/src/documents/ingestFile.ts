import type { KnowledgeDocument } from '@ai-chat/shared';
import { getFileStorage } from './fileStorage.js';
import { validateUpload } from './validateUpload.js';
import { sha256Hex } from '../rag/contentHash.js';
import {
  findByFilenameInKnowledgeBase,
  findByHashInKnowledgeBase,
  insert,
  toPublicDocument,
} from '../rag/pgDocumentStore.js';
import { enqueueIngest } from '../rag/ingestWorker.js';

export type IngestFileResult =
  | { ok: true; document: KnowledgeDocument }
  | { ok: false; msg: string };

/**
 * 将单个文件落入指定知识库：落盘后立即返回 pending，解析在进程内异步进行。
 */
export async function ingestFile(input: {
  ownerUsername: string;
  knowledgeBaseId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  sourceRelativePath?: string | null;
}): Promise<IngestFileResult> {
  const validated = validateUpload({
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    bytes: input.buffer,
  });
  if (!validated.ok) {
    return validated;
  }

  const sameName = await findByFilenameInKnowledgeBase(
    input.ownerUsername,
    input.knowledgeBaseId,
    validated.value.filename,
  );
  if (sameName) {
    return {
      ok: false,
      msg: duplicateNameMsg(sameName.filename),
    };
  }

  const contentHash = sha256Hex(input.buffer);
  const sameContent = await findByHashInKnowledgeBase(
    input.ownerUsername,
    input.knowledgeBaseId,
    contentHash,
  );
  if (sameContent) {
    return {
      ok: false,
      msg: duplicateContentMsg(sameContent.filename),
    };
  }

  const id = crypto.randomUUID();
  const storage = getFileStorage();
  const relativePath = storage.relativePath(
    input.ownerUsername,
    id,
    validated.value.ext,
  );

  try {
    storage.write(relativePath, input.buffer);
  } catch {
    return { ok: false, msg: '哎呀，文件保存失败了，请稍后重试' };
  }

  try {
    const row = await insert({
      id,
      knowledgeBaseId: input.knowledgeBaseId,
      ownerUsername: input.ownerUsername,
      filename: validated.value.filename,
      mimeType: validated.value.mimeType,
      sizeBytes: input.buffer.byteLength,
      storagePath: relativePath,
      contentHash,
      status: 'pending',
      progress: 0,
      error: null,
      sourceRelativePath: input.sourceRelativePath ?? null,
    });
    enqueueIngest({
      documentId: id,
      ownerUsername: input.ownerUsername,
      kind: validated.value.kind,
    });
    return { ok: true, document: toPublicDocument(row) };
  } catch (error) {
    storage.remove(relativePath);
    if (isUniqueViolation(error)) {
      const existingName = await findByFilenameInKnowledgeBase(
        input.ownerUsername,
        input.knowledgeBaseId,
        validated.value.filename,
      );
      if (existingName) {
        return { ok: false, msg: duplicateNameMsg(existingName.filename) };
      }
      const existingHash = await findByHashInKnowledgeBase(
        input.ownerUsername,
        input.knowledgeBaseId,
        contentHash,
      );
      if (existingHash) {
        return { ok: false, msg: duplicateContentMsg(existingHash.filename) };
      }
      return { ok: false, msg: '资料库里已有相同文件' };
    }
    return { ok: false, msg: '哎呀，上传失败了，请稍后重试' };
  }
}

function duplicateNameMsg(filename: string): string {
  return `资料库里已有同名文件「${filename}」`;
}

function duplicateContentMsg(filename: string): string {
  return `资料库里已有相同内容的文件「${filename}」`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}
