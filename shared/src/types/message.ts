export type ChatRole = 'user' | 'assistant';

export type MessageStatus = 'pending' | 'sent' | 'error';

export interface Message {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  status: MessageStatus;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
