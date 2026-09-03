/** 规范化空标题用于展示；长度截断仅由 CSS ellipsis 处理。 */
export function displayConversationTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || '新对话';
}
