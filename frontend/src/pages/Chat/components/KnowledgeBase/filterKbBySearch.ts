import type { KnowledgeBase } from '@ai-chat/shared';

export function filterKbBySearch(
  items: KnowledgeBase[],
  search: string,
): KnowledgeBase[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((kb) => kb.name.toLowerCase().includes(q));
}
