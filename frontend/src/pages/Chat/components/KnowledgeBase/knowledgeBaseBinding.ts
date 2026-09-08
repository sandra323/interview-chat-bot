import { resolveKnowledgeBaseFromCatalog } from '@/components/Layout/Header/knowledgeBaseOptions';

export interface PatchConversationFn {
  (
    conversationId: string,
    patch: { knowledgeBaseId: string | null },
  ): Promise<unknown>;
}

/** Header 切换 KB：乐观更新，PATCH 失败时回滚。 */
export function bindKnowledgeBaseChange(
  next: string | null,
  prev: string | null,
  options: {
    conversationId: string | null;
    useMock: boolean;
    setKnowledgeBaseId: (value: string | null) => void;
    patchConversation: PatchConversationFn;
    onPatchError: (error: unknown) => void;
  },
): void {
  options.setKnowledgeBaseId(next);
  if (!options.conversationId || options.useMock) {
    return;
  }
  void options
    .patchConversation(options.conversationId, { knowledgeBaseId: next })
    .catch((error: unknown) => {
      options.setKnowledgeBaseId(prev);
      options.onPatchError(error);
    });
}

/** 删库后若当前 Chat 正绑定该库，清 UI 并 PATCH 服务端解绑。 */
export async function unbindCurrentChatIfDeletedKb(
  deletedKbId: string,
  currentBoundId: string | null,
  conversationId: string | null,
  options: {
    useMock: boolean;
    setKnowledgeBaseId: (value: string | null) => void;
    patchConversation: PatchConversationFn;
    onPatchError: (error: unknown) => void;
  },
): Promise<void> {
  if (currentBoundId !== deletedKbId) {
    return;
  }
  options.setKnowledgeBaseId(null);
  if (!conversationId || options.useMock) {
    return;
  }
  await options
    .patchConversation(conversationId, { knowledgeBaseId: null })
    .catch((error: unknown) => {
      options.onPatchError(error);
    });
}

/** 服务端仍绑已删/不可用库时，静默 PATCH 解绑。 */
export async function syncStaleKnowledgeBaseBinding(
  conversationId: string | null,
  serverKnowledgeBaseId: string | null | undefined,
  options: {
    useMock: boolean;
    patchConversation: PatchConversationFn;
  },
): Promise<void> {
  if (options.useMock || !conversationId || !serverKnowledgeBaseId) {
    return;
  }
  if (resolveKnowledgeBaseFromCatalog(serverKnowledgeBaseId) !== null) {
    return;
  }
  await options
    .patchConversation(conversationId, { knowledgeBaseId: null })
    .catch(() => {});
}
