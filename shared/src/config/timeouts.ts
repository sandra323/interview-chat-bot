/**
 * LLM 请求超时的唯一来源。
 * 后端通过 AbortController 强制执行；前端在 provider registry 中镜像这些值。
 * 不要接受客户端传入的 timeout — 避免无上限的等待。
 */
export const DEFAULT_LLM_TIMEOUT_MS = 60_000;

/** 按模型覆盖（毫秒）。注册新模型时添加条目。 */
export const MODEL_TIMEOUT_MS: Readonly<Record<string, number>> = {
  'deepseek-v4-flash': 60_000,
  'deepseek-v4-pro': 120_000,
};

export function getModelTimeoutMs(model: string): number {
  return MODEL_TIMEOUT_MS[model] ?? DEFAULT_LLM_TIMEOUT_MS;
}
