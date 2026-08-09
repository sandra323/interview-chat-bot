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

/** Load env from repo root then backend (later files override). Never commit real .env.local. */
export function loadEnvFiles(): void {
  dotenv.config({ path: path.join(repoRoot, '.env') });
  dotenv.config({ path: path.join(repoRoot, '.env.local') });
  dotenv.config({ path: path.join(backendRoot, '.env') });
  dotenv.config({ path: path.join(backendRoot, '.env.local') });
}

const DEFAULT_API_URL = 'https://api.deepseek.com/chat/completions';

export interface ServerEnv {
  port: number;
  nodeEnv: string;
  corsOrigin: string | undefined;
  llmApiUrl: string;
  llmApiKey: string;
  defaultModel: AllowedModelId;
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

  return {
    port: Number(process.env.PORT) || 3001,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigin: process.env.CORS_ORIGIN?.trim() || undefined,
    llmApiUrl: apiUrl,
    llmApiKey: apiKey,
    defaultModel,
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
