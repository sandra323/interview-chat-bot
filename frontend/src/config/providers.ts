/**
 * LLM model registry for UI labels only.
 * API credentials live exclusively on the backend (DEEPSEEK_API_KEY).
 */

import { getModelTimeoutMs } from '@ai-chat/shared';

export type LLMCapability = 'chat' | 'stream' | 'thinking';

export interface LLMModelDef {
  id: string;
  label: string;
  badge?: string;
  preferredTimeoutMs?: number;
  supportsThinking?: boolean;
}

export interface LLMProviderDef {
  id: string;
  label: string;
  defaultModelId: string;
  models: LLMModelDef[];
  capabilities: LLMCapability[];
}

export const LLM_PROVIDERS: LLMProviderDef[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModelId: 'deepseek-v4-flash',
    capabilities: ['chat', 'stream', 'thinking'],
    models: [
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        badge: 'CHEAP',
        preferredTimeoutMs: getModelTimeoutMs('deepseek-v4-flash'),
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        badge: 'PRO',
        preferredTimeoutMs: getModelTimeoutMs('deepseek-v4-pro'),
        supportsThinking: true,
      },
    ],
  },
];

export const DEFAULT_PROVIDER_ID = 'deepseek';

export function getProviderById(
  providerId: string,
): LLMProviderDef | undefined {
  return LLM_PROVIDERS.find((p) => p.id === providerId);
}

export function getDefaultProvider(): LLMProviderDef {
  return getProviderById(DEFAULT_PROVIDER_ID) ?? LLM_PROVIDERS[0];
}

export function findProviderByModelId(
  modelId: string,
): LLMProviderDef | undefined {
  return LLM_PROVIDERS.find((p) => p.models.some((m) => m.id === modelId));
}

export function getAllModelOptions(): Array<{
  id: string;
  label: string;
  badge?: string;
  providerId: string;
  providerLabel: string;
}> {
  return LLM_PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      label: model.label,
      badge: model.badge,
      providerId: provider.id,
      providerLabel: provider.label,
    })),
  );
}
