/** Display-only truncation for conversation titles (sidebar / header). */
export function truncateConversationTitle(
  title: string,
  maxLength = 28,
): string {
  const trimmed = title.trim();
  if (!trimmed) return '新对话';
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}
