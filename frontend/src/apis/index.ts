export { apiGet, apiPost, apiPatch, apiDelete, ApiError } from './http/client';
export {
  login,
  logout,
  fetchMe,
  AUTH_FALLBACK_LOGIN,
  AUTH_FALLBACK_NETWORK,
} from './auth';
export type { AuthSessionPayload, AuthMePayload } from './auth';
export {
  fetchConversations,
  fetchConversationMessages,
  HISTORY_PAGE_SIZE,
} from './conversations';
export type {
  ConversationListItem,
  ConversationMessageItem,
  ConversationMessagesPage,
} from './conversations';
export { WebSocketClient } from './websocket/client';
export type { WebSocketStatus, MessageHandler, StatusHandler } from './websocket/client';
export { sendChatMessage, sendPing } from './websocket/chat';
export { parseServerMessage, serializeClientMessage, isServerMessage } from './websocket/messageParser';
