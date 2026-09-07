import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  DEFAULT_MODEL_ID,
  isAllowedModelId,
  type AllowedModelId,
  type LLMConfig,
} from '@ai-chat/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '..');

/** bcrypt 哈希格式：$2a$ / $2b$ / $2y$ + cost + 53 字符 salt+hash */
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** 从仓库根目录再加载 backend 目录下的 env（后加载的文件覆盖前者）。切勿提交真实的 .env.local。 */
export function loadEnvFiles(): void {
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });
  dotenv.config({ path: path.join(backendRoot, '.env'), override: true });
  dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });
}

const DEFAULT_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_SESSION_TTL_HOURS = 24;

export interface ServerEnv {
  port: number;
  nodeEnv: string;
  corsOrigin: string | undefined;
  llmApiUrl: string;
  llmApiKey: string;
  defaultModel: AllowedModelId;
  /** 演示登录用户名（环境变量 AUTH_USERNAME）。 */
  authUsername: string;
  /** 演示密码的 bcrypt 哈希（环境变量 AUTH_PASSWORD_HASH）。禁止明文。 */
  authPasswordHash: string;
  /** 会话绝对 TTL，单位小时（环境变量 AUTH_SESSION_TTL_HOURS，默认 24）。 */
  authSessionTtlHours: number;
  /**
   * PostgreSQL 连接串（环境变量 DATABASE_URL）。
   * 为空则跳过 RAG/pgvector 初始化，现有 Chat/资料库仍可用。
   */
  databaseUrl: string;
  /** OpenAI embedding（环境变量 OPENAI_API_KEY）。缺省不阻断启动。 */
  openaiApiKey: string;
  openaiEmbeddingModel: string;
  openaiEmbeddingModelVersion: string;
}

export function readServerEnv(): ServerEnv {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? '';
  const apiUrl =
    process.env.DEEPSEEK_API_URL?.trim() || DEFAULT_API_URL;
  const modelRaw =
    process.env.DEEPSEEK_DEFAULT_MODEL?.trim() || DEFAULT_MODEL_ID;
  const defaultModel = isAllowedModelId(modelRaw)
    ? modelRaw
    : DEFAULT_MODEL_ID;

  const ttlRaw = process.env.AUTH_SESSION_TTL_HOURS?.trim();
  const ttlParsed =
    ttlRaw === undefined || ttlRaw === ''
      ? DEFAULT_SESSION_TTL_HOURS
      : Number(ttlRaw);

  return {
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigin: process.env.CORS_ORIGIN?.trim() || undefined,
    llmApiUrl: apiUrl,
    llmApiKey: apiKey,
    defaultModel,
    authUsername: process.env.AUTH_USERNAME?.trim() ?? '',
    authPasswordHash: process.env.AUTH_PASSWORD_HASH?.trim() ?? '',
    authSessionTtlHours: ttlParsed,
    databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    openaiEmbeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small',
    openaiEmbeddingModelVersion:
      process.env.OPENAI_EMBEDDING_MODEL_VERSION?.trim() ||
      'text-embedding-3-small@2024-01-25',
  };
}

export function assertLlmCredentials(env: ServerEnv): void {
  if (!env.llmApiKey) {
    throw new Error(
      'Missing DEEPSEEK_API_KEY. Set it in repo-root or backend .env.local (never commit real keys).',
    );
  }
  if (!env.llmApiUrl.startsWith('https://') && env.nodeEnv === 'production') {
    throw new Error('DEEPSEEK_API_URL must use https:// in production');
  }
}

/**
 * 演示认证环境变量缺失或无效时快速失败。
 * 不支持明文 AUTH_PASSWORD（若已设置则拒绝）。
 */
export function assertAuthCredentials(env: ServerEnv): void {
  if (process.env.AUTH_PASSWORD?.trim()) {
    throw new Error(
      'AUTH_PASSWORD is not supported. Generate a bcrypt hash and set AUTH_PASSWORD_HASH only (see .env.example).',
    );
  }
  if (!env.authUsername) {
    throw new Error(
      'Missing AUTH_USERNAME. Set it in repo-root or backend .env.local.',
    );
  }
  if (!env.authPasswordHash) {
    throw new Error(
      'Missing AUTH_PASSWORD_HASH. Generate a bcrypt hash (see .env.example) and set it in .env.local — never use plaintext AUTH_PASSWORD.',
    );
  }
  if (!BCRYPT_HASH_RE.test(env.authPasswordHash)) {
    throw new Error(
      'AUTH_PASSWORD_HASH is not a valid bcrypt hash (expected $2a$/$2b$/$2y$…).',
    );
  }
  if (
    !Number.isFinite(env.authSessionTtlHours) ||
    env.authSessionTtlHours <= 0
  ) {
    throw new Error(
      'AUTH_SESSION_TTL_HOURS must be a positive number (default 24).',
    );
  }
}

export function buildLlmConfig(
  env: ServerEnv,
  model: AllowedModelId,
): LLMConfig {
  return {
    apiUrl: env.llmApiUrl,
    apiKey: env.llmApiKey,
    model,
  };
}
