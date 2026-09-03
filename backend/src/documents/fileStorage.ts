import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOADS_DIR = path.resolve(__dirname, '../../.data/uploads');

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'user';
}

function assertInsideRoot(rootDir: string, resolved: string): void {
  const root = path.resolve(rootDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('invalid storage path');
  }
}

/**
 * 资料库原文件落盘。相对路径 `{username}/{id}{ext}` 存入数据库。
 */
export class FileStorage {
  constructor(private readonly rootDir = DEFAULT_UPLOADS_DIR) {
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  get root(): string {
    return this.rootDir;
  }

  relativePath(ownerUsername: string, id: string, ext: string): string {
    const safeUser = sanitizeSegment(ownerUsername);
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
    return `${safeUser}/${id}${safeExt}`;
  }

  resolve(relativePath: string): string {
    const resolved = path.resolve(this.rootDir, relativePath);
    assertInsideRoot(this.rootDir, resolved);
    return resolved;
  }

  write(relativePath: string, buffer: Buffer): void {
    const dest = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
  }

  read(relativePath: string): Buffer {
    return fs.readFileSync(this.resolve(relativePath));
  }

  exists(relativePath: string): boolean {
    try {
      return fs.existsSync(this.resolve(relativePath));
    } catch {
      return false;
    }
  }

  remove(relativePath: string): void {
    try {
      fs.rmSync(this.resolve(relativePath), { force: true });
    } catch {
      // 忽略
    }
  }
}

let singleton: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (!singleton) {
    singleton = new FileStorage();
  }
  return singleton;
}

export function resetFileStorageForTests(rootDir?: string): FileStorage {
  singleton = new FileStorage(rootDir);
  return singleton;
}
