export const MainView = {
  Chat: 'chat',
  Library: 'library',
} as const;

export type MainView = (typeof MainView)[keyof typeof MainView];

export type MainViewChrome = {
  /** 固定顶栏标题；未设置时沿用当前对话标题 */
  headerTitle?: string;
  showChatActions: boolean;
  /** 为 false 时侧栏不高亮当前对话 */
  keepConversationActive: boolean;
};

const MAIN_VIEW_CHROME: Record<MainView, MainViewChrome> = {
  [MainView.Chat]: {
    showChatActions: true,
    keepConversationActive: true,
  },
  [MainView.Library]: {
    headerTitle: '资料库',
    showChatActions: false,
    keepConversationActive: false,
  },
};

export function getMainViewChrome(view: MainView): MainViewChrome {
  return MAIN_VIEW_CHROME[view];
}
