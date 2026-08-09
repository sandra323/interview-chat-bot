import {
  getDefaultProvider,
  getEnvApiKey,
  getProviderPreset,
} from './providers';

/** 静态预览模式：true 时使用 mock 数据，不连接后端 WebSocket / 真实 LLM API */
export const USE_MOCK = false;

/** mock 模式下模拟 AI 回复延迟（毫秒） */
export const MOCK_REPLY_DELAY_MS = 1200;

const defaultProvider = getDefaultProvider();
const defaultPreset = getProviderPreset(defaultProvider.id);

/** Default DeepSeek (or DEFAULT_PROVIDER_ID) chat completions URL */
export const DEEPSEEK_API_URL = defaultPreset.apiUrl;

/** Default model id from the active provider registry */
export const DEFAULT_MODEL = defaultPreset.model;

/** From frontend/.env.local — never commit real keys */
export const DEEPSEEK_API_KEY = getEnvApiKey(defaultProvider);
