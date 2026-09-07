import { createHash } from 'node:crypto';

/** 上传时对文件内容算 SHA-256（content_hash），用于去重。 */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
