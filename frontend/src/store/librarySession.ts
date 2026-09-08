export const LIBRARY_ACTIVE_KB_KEY = 'library-active-kb';
export const CHAT_MAIN_VIEW_KEY = 'chat-main-view';

export function readLibraryActiveKb(): string | null {
  try {
    return sessionStorage.getItem(LIBRARY_ACTIVE_KB_KEY);
  } catch {
    return null;
  }
}

export function writeLibraryActiveKb(id: string | null): void {
  try {
    if (!id) {
      sessionStorage.removeItem(LIBRARY_ACTIVE_KB_KEY);
      return;
    }
    sessionStorage.setItem(LIBRARY_ACTIVE_KB_KEY, id);
  } catch {
    // 隐私模式等写失败可忽略
  }
}

export type PersistedMainView = 'chat' | 'library';

export function readPersistedMainView(): PersistedMainView {
  try {
    const value = sessionStorage.getItem(CHAT_MAIN_VIEW_KEY);
    return value === 'library' ? 'library' : 'chat';
  } catch {
    return 'chat';
  }
}

export function writePersistedMainView(view: PersistedMainView): void {
  try {
    sessionStorage.setItem(CHAT_MAIN_VIEW_KEY, view);
  } catch {
    // 隐私模式等写失败可忽略
  }
}
