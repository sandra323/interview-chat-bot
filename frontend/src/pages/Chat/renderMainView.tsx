import type { ReactNode } from 'react';
import ChatView from './components/ChatView';
import KnowledgeBase from './components/KnowledgeBase';
import { MainView, type MainView as MainViewId } from './mainView';

export type RenderMainViewHandlers = {
  onSend: (text: string) => boolean;
  onStop: () => void;
  onLoadOlder: () => void;
};

export function renderMainView(
  view: MainViewId,
  handlers: RenderMainViewHandlers,
): ReactNode {
  switch (view) {
    case MainView.Chat:
      return (
        <ChatView
          onSend={handlers.onSend}
          onStop={handlers.onStop}
          onLoadOlder={handlers.onLoadOlder}
        />
      );
    case MainView.Library:
      return <KnowledgeBase />;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}
