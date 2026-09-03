import { apiDelete, apiGet, apiPatch } from './http/client';

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: number;
  generating?: boolean;
}

export interface ConversationMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface ConversationMessagesPage {
  items: ConversationMessageItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface ConversationsData {
  items: ConversationListItem[];
}

/** 默认分页大小 ≈ 5 轮 user/assistant 对话 */
export const HISTORY_PAGE_SIZE = 10;

/** 从 GET /api/conversations 拉取侧栏历史 */
export async function fetchConversations(): Promise<ConversationListItem[]> {
  const data = await apiGet<ConversationsData>('/api/conversations');
  return data.items ?? [];
}

/** 分页消息 —— page=1 为最新一批 */
export async function fetchConversationMessages(
  conversationId: string,
  options?: { page?: number; pageSize?: number },
): Promise<ConversationMessagesPage> {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? HISTORY_PAGE_SIZE;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiGet<ConversationMessagesPage>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${query}`,
  );
}

/** 重命名对话（自定义标题） */
export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<{ id: string; title: string }> {
  return apiPatch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    title,
  });
}

/** 删除对话及其消息 */
export async function deleteConversation(
  conversationId: string,
): Promise<{ id: string }> {
  return apiDelete(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
  );
}
