export interface ModelOption {
  id: string;
  label: string;
  badge?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', badge: 'FAST' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', badge: 'LATEST' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', badge: 'POWERFUL' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', badge: 'FAST' },
];

export const SUGGESTIONS = [
  '解释机器学习中的梯度下降',
  '帮我写一份项目需求文档',
  '分析《三体》的核心主题',
  '用 TypeScript 实现一个 debounce 函数',
];
