import { getAllModelOptions } from './providers';

export interface ModelOption {
  id: string;
  label: string;
  badge?: string;
  providerId?: string;
  providerLabel?: string;
}

/** 派生自 `LLM_PROVIDERS` —— 在此添加 model，而非本文件。 */
export const MODEL_OPTIONS: ModelOption[] = getAllModelOptions();

export const SUGGESTIONS = [
  '解释机器学习中的梯度下降',
  '帮我写一份项目需求文档',
  '分析《三体》的核心主题',
  '用 TypeScript 实现一个 debounce 函数',
];
