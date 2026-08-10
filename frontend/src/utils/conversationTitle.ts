/** Normalize empty titles for display; length truncation is CSS ellipsis only. */
export function displayConversationTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || '新对话';
}
