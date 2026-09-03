/**
 * 服务端强制执行的模型白名单。
 * 客户端可建议 model id；未知 id 会被拒绝或回退到默认值。
 */

export const ALLOWED_MODEL_IDS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const;

export type AllowedModelId = (typeof ALLOWED_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: AllowedModelId = 'deepseek-v4-flash';

export function isAllowedModelId(model: string): model is AllowedModelId {
  return (ALLOWED_MODEL_IDS as readonly string[]).includes(model);
}

export function resolveAllowedModel(model: string | undefined): AllowedModelId {
  if (model && isAllowedModelId(model)) return model;
  return DEFAULT_MODEL_ID;
}
