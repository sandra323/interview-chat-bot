/**
 * LLM provider registry — single place to add vendors / models.
 *
 * Timeouts: use `getModelTimeoutMs` from `@ai-chat/shared` (enforced on backend).
 * Do not send timeout from the browser — keeps one source of truth.
 */

import { getModelTimeoutMs } from '@ai-chat/shared';

export type LLMCapability = 'chat' | 'stream' | 'thinking';

export type LLMAdapterKind = 'openai-compatible';

export interface LLMModelDef {
  id: string;
  label: string;
  badge?: string;
  /** Mirrors shared MODEL_TIMEOUT_MS for UI / docs; backend enforces the same map. */
  preferredTimeoutMs?: number;
  supportsThinking?: boolean;
}

export interface LLMProviderDef {
  id: string;
  label: string;
  apiUrl: string;
  /** Vite env key for local default API key (optional). */
  envApiKeyName?: 'VITE_DEEPSEEK_API_KEY';
  defaultModelId: string;
  models: LLMModelDef[];
  adapter: LLMAdapterKind;
  capabilities: LLMCapability[];
}

export const LLM_PROVIDERS: LLMProviderDef[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    envApiKeyName: 'VITE_DEEPSEEK_API_KEY',
    defaultModelId: 'deepseek-v4-flash',
    adapter: 'openai-compatible',
    // stream / thinking reserved for Phase 2 — registry already lists them
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
  // Example of extending later (commented — enable when ready):
  // {
  //   id: 'openai',
  //   label: 'OpenAI',
  //   apiUrl: 'https://api.openai.com/v1/chat/completions',
  //   defaultModelId: 'gpt-4o-mini',
  //   adapter: 'openai-compatible',
  //   capabilities: ['chat', 'stream'],
  //   models: [
  //     { id: 'gpt-4o-mini', label: 'GPT-4o mini', badge: 'FAST' },
  //     { id: 'gpt-4o', label: 'GPT-4o' },
  //   ],
  // },
];

export const DEFAULT_PROVIDER_ID = 'deepseek';

export function getProviderById(
  providerId: string,
): LLMProviderDef | undefined {
  return LLM_PROVIDERS.find((p) => p.id === providerId);
}

export function getDefaultProvider(): LLMProviderDef {
  return (
    getProviderById(DEFAULT_PROVIDER_ID) ?? LLM_PROVIDERS[0]
  );
}

export function findProviderByModelId(
  modelId: string,
): LLMProviderDef | undefined {
  return LLM_PROVIDERS.find((p) => p.models.some((m) => m.id === modelId));
}

export function findModelDef(modelId: string): LLMModelDef | undefined {
  for (const provider of LLM_PROVIDERS) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model;
  }
  return undefined;
}

/** Flat list for Header / ConfigPanel selects. */
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

export function getEnvApiKey(provider: LLMProviderDef): string {
  if (provider.envApiKeyName === 'VITE_DEEPSEEK_API_KEY') {
    return import.meta.env.VITE_DEEPSEEK_API_KEY?.trim() ?? '';
  }
  return '';
}

/** Build config fields for a provider preset (Settings one-click). */
export function getProviderPreset(providerId: string): {
  apiUrl: string;
  apiKey: string;
  model: string;
} {
  const provider = getProviderById(providerId) ?? getDefaultProvider();
  return {
    apiUrl: provider.apiUrl,
    apiKey: getEnvApiKey(provider),
    model: provider.defaultModelId,
  };
}
