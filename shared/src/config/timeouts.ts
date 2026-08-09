/**
 * Single source of truth for LLM request timeouts.
 * Backend enforces these via AbortController; frontend mirrors them in the provider registry.
 * Do not accept timeout from the client — avoid unbounded waits.
 */
export const DEFAULT_LLM_TIMEOUT_MS = 60_000;

/** Per-model overrides (ms). Add entries when registering new models. */
export const MODEL_TIMEOUT_MS: Readonly<Record<string, number>> = {
  'deepseek-v4-flash': 60_000,
  'deepseek-v4-pro': 120_000,
};

export function getModelTimeoutMs(model: string): number {
  return MODEL_TIMEOUT_MS[model] ?? DEFAULT_LLM_TIMEOUT_MS;
}
