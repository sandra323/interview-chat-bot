import type { KnowledgeDocument } from '@ai-chat/shared';
import { getDocumentStore } from './documentStore.js';
import { getFileStorage } from './fileStorage.js';
import { validateUpload } from './validateUpload.js';

export type IngestFileResult =
  | { ok: true; document: KnowledgeDocument }
  | { ok: false; msg: string };

/**
 * 将单个文件落入当前用户的资料库。
 * 后续文件夹上传应对目录内每个文件调用本函数（表格仍按文件展示）。
 */
export function ingestFile(input: {
  ownerUsername: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  sourceRelativePath?: string | null;
}): IngestFileResult {
  const validated = validateUpload({
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    bytes: input.buffer,
  });
  if (!validated.ok) {
    return validated;
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
    const document = getDocumentStore().insert({
      id,
      ownerUsername: input.ownerUsername,
      filename: validated.value.filename,
      mimeType: validated.value.mimeType,
      sizeBytes: input.buffer.byteLength,
      storagePath: relativePath,
      status: 'ready',
      progress: 100,
      error: null,
      createdAt: Date.now(),
      sourceRelativePath: input.sourceRelativePath ?? null,
    });
    return { ok: true, document };
  } catch {
    storage.remove(relativePath);
    return { ok: false, msg: '哎呀，上传失败了，请稍后重试' };
  }
}
