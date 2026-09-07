import { ParseEmptyError } from './parse/types.js';

export class MissingFileError extends Error {
  readonly userMessage = '找不到原文件，请重新上传';

  constructor() {
    super('ingest-missing-file');
    this.name = 'MissingFileError';
  }
}

export class ChunkEmptyError extends Error {
  readonly userMessage =
    '未能从文件中提取文字，请确认文件包含可复制的文本，而不是纯图片扫描件';

  constructor() {
    super('ingest-chunk-empty');
    this.name = 'ChunkEmptyError';
  }
}

export class ChunkTooLongError extends Error {
  readonly userMessage = '文件有过长段落，请拆分后再传';

  constructor() {
    super('ingest-chunk-too-long');
    this.name = 'ChunkTooLongError';
  }
}

export class EmbedConfigError extends Error {
  readonly userMessage = '向量服务未配置，请联系管理员';

  constructor() {
    super('ingest-embed-not-configured');
    this.name = 'EmbedConfigError';
  }
}

export class EmbedUnavailableError extends Error {
  readonly userMessage = '向量服务暂时不可用，请稍后重试';

  constructor(cause?: unknown) {
    super('ingest-embed-unavailable');
    this.name = 'EmbedUnavailableError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class EmbedQuotaError extends Error {
  readonly userMessage =
    'OpenAI 账户余额不足，请充值后再上传资料（platform.openai.com 账单页）';

  constructor() {
    super('ingest-embed-quota-exhausted');
    this.name = 'EmbedQuotaError';
  }
}

export class EmbedResponseError extends Error {
  readonly userMessage = '向量服务返回异常，请稍后重试';

  constructor(detail: string) {
    super(detail);
    this.name = 'EmbedResponseError';
  }
}

export class PersistError extends Error {
  readonly userMessage = '入库失败，请稍后重试';

  constructor(cause?: unknown) {
    super('ingest-persist-failed');
    this.name = 'PersistError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export function userMessageForIngestError(error: unknown): string {
  if (error instanceof ParseEmptyError) {
    return error.message;
  }
  if (
    error instanceof MissingFileError ||
    error instanceof ChunkEmptyError ||
    error instanceof ChunkTooLongError ||
    error instanceof EmbedConfigError ||
    error instanceof EmbedQuotaError ||
    error instanceof EmbedUnavailableError ||
    error instanceof EmbedResponseError ||
    error instanceof PersistError
  ) {
    return error.userMessage;
  }
  return '哎呀，文件处理失败了，请稍后重试';
}
