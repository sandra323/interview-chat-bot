/**
 * Server-enforced model allowlist.
 * Clients may suggest a model id; unknown ids are rejected or fall back to default.
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
