/** Server-side LLM credentials — never sent to or accepted from the browser. */
export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

/**
 * @deprecated Prefer LLMConfig for server use. Kept as alias during migration.
 */
export type Config = LLMConfig;
