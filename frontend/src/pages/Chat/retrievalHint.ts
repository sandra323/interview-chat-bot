import { KNOWLEDGE_BASE_SEARCH_TOOL } from '@ai-chat/shared';

/** `undefined` 表示忽略该事件，不改当前提示。 */
export function retrievalHintFromToolEvent(
  name: string,
  event: string,
): string | null | undefined {
  if (name !== KNOWLEDGE_BASE_SEARCH_TOOL) {
    return undefined;
  }
  if (event === 'start') {
    return '正在检索知识库…';
  }
  if (event === 'error') {
    return '知识库检索暂不可用，将按普通对话回答';
  }
  return null;
}
