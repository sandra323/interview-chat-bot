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

/** bcrypt hash: $2a$ / $2b$ / $2y$ + cost + 53-char salt+hash */
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Load env from repo root then backend (later files override). Never commit real .env.local. */
export function loadEnvFiles(): void {
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(repoRoot, '.env.local') });
  dotenv.config({ path: path.join(backendRoot, '.env') });
  dotenv.config({ path: path.join(backendRoot, '.env.local') });
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
  /** Demo login username (env AUTH_USERNAME). */
  authUsername: string;
  /** bcrypt hash of demo password (env AUTH_PASSWORD_HASH). Never plaintext. */
  authPasswordHash: string;
  /** Absolute session TTL in hours (env AUTH_SESSION_TTL_HOURS, default 24). */
  authSessionTtlHours: number;
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
 * Fail fast if demo auth env is missing/invalid.
 * Does not support plaintext AUTH_PASSWORD (reject if set).
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
