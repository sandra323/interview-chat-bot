import { useKnowledgeBaseCatalog } from '@/store/useKnowledgeBaseCatalog';

export type KnowledgeBaseOption = { value: string; label: string };

/**
 * 当前绑定的 KB 若已不在 catalog（例如刚删除），视为未绑定。
 * catalog 未 ready 前保留原值，避免加载中误清空。
 */
export function resolveKnowledgeBaseSelection(
  knowledgeBaseId: string | null,
  catalogIds: string[],
  catalogReady: boolean,
): string | null {
  if (!knowledgeBaseId) {
    return null;
  }
  if (!catalogReady) {
    return knowledgeBaseId;
  }
  return catalogIds.includes(knowledgeBaseId) ? knowledgeBaseId : null;
}

/** 从 catalog 内存态解析绑定；供切换会话 / 拉消息元数据时使用。 */
export function resolveKnowledgeBaseFromCatalog(
  knowledgeBaseId: string | null | undefined,
): string | null {
  const catalog = useKnowledgeBaseCatalog.getState();
  return resolveKnowledgeBaseSelection(
    knowledgeBaseId ?? null,
    catalog.items.map((kb) => kb.id),
    catalog.status === 'ready',
  );
}
