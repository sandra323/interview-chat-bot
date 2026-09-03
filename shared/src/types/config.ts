/** 服务端 LLM 凭据 — 不会发送给浏览器，也不从浏览器接收。 */
export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

/**
 * @deprecated 服务端请优先使用 LLMConfig。迁移期间保留此别名。
 */
export type Config = LLMConfig;
