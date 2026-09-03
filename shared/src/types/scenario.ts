/**
 * 对话场景：决定智能体的 system prompt（persona）与行为方式。
 * 所有场景下工具均可用，场景只改变人设与开场行为。
 */

export const SCENARIO_IDS = [
  'free_chat',
  'mock_interview',
  'interview_review',
  'jd_analysis',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const DEFAULT_SCENARIO_ID: ScenarioId = 'free_chat';

/** 场景的中文展示名（前端选择器与导航使用） */
export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  free_chat: '自由聊天',
  mock_interview: '模拟面试',
  interview_review: '面试复盘',
  jd_analysis: 'JD 分析',
};

export function isScenarioId(value: unknown): value is ScenarioId {
  return (
    typeof value === 'string' &&
    (SCENARIO_IDS as readonly string[]).includes(value)
  );
}

export function resolveScenario(value: unknown): ScenarioId {
  return isScenarioId(value) ? value : DEFAULT_SCENARIO_ID;
}
