import { apiGet } from './http/client';

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

/** Default page size ≈ 5 user/assistant turns */
export const HISTORY_PAGE_SIZE = 10;

/** Fetch sidebar history from GET /api/conversations */
export async function fetchConversations(): Promise<ConversationListItem[]> {
  const data = await apiGet<ConversationsData>('/api/conversations');
  return data.items ?? [];
}

/** Paginated messages — page=1 is the newest batch */
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
