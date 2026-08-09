import type { Message } from '@ai-chat/shared';
import { createMessage } from '@/store/useChatStore';

/** 页面初始展示的示例对话，便于静态预览 UI 效果 */
export const MOCK_INITIAL_MESSAGES: Message[] = [
  createMessage('user', '你好，这个聊天页面长什么样？'),
  createMessage(
    'assistant',
    '这是 AI Chat 的静态预览模式。\n\n- 用户消息在右侧（蓝色气泡）\n- AI 回复在左侧（灰色气泡）\n- 下方输入框可以发送消息，会返回 mock 回复',
  ),
  createMessage('user', '那我现在不用配置 API Key 也能试吗？'),
  createMessage(
    'assistant',
    '对的。当前已开启 mock 模式，所有回复都是本地模拟数据。联调真实 API 时，把 config/app.ts 里的 USE_MOCK 改回 false，并在后端 .env.local 配置 DEEPSEEK_API_KEY。',
  ),
];

const MOCK_REPLIES = [
  '这是 **mock 模式** 的模拟回复。你的消息已成功收到！\n\n可以用行内代码 `token` 或代码块验证流式 Markdown：\n\n```ts\nconst ok = true;\nconsole.log(ok);\n```',
  '静态预览运行正常。界面包含消息列表、输入框和 Loading 动画。\n\n- **加粗** 与 `行内代码`\n- 未闭合语法会在流式过程中即时成样式',
  'Mock 模式下不会发起真实的网络请求，可以放心查看 UI 效果。\n\n收到：「{input}」\n\n（以上为 mock 数据，非真实 LLM 回复）',
  '收到：「{input}」\n\n### 小结\n\n1. 流式分片推送\n2. Markdown **边收边渲染**\n3. 贴底跟滚（上滑超过 30px 暂停）',
];

export function generateMockReply(userInput: string): string {
  const template =
    MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
  return template.replace('{input}', userInput);
}
