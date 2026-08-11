import type { ClientMessage, ServerMessage } from '@ai-chat/shared';

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      return null;
    }
    return parsed as ServerMessage;
  } catch {
    return null;
  }
}

export function serializeClientMessage(message: ClientMessage): string {
  return JSON.stringify(message);
}
