import type { ChatMessage, LLMConfig } from '@ai-chat/shared';
import { AIMessage, HumanMessage, SystemMessage } from 'langchain';
import { createInterviewAgent } from './createInterviewAgent.js';

type ContentBlock = {
  type?: string;
  text?: string;
};

/** 只从 LangChain 消息片段中提取需要展示给用户的文本。 */
function readText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((block: unknown) => {
      if (!block || typeof block !== 'object') return '';
      const { type, text } = block as ContentBlock;
      return (type === 'text' || type === 'text_delta') &&
        typeof text === 'string'
        ? text
        : '';
    })
    .join('');
}

function toLangChainMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    switch (message.role) {
      case 'assistant':
        return new AIMessage(message.content);
      case 'system':
        return new SystemMessage(message.content);
      case 'user':
        return new HumanMessage(message.content);
    }
  });
}

/**
 * 执行一轮智能体对话，并以文本增量的形式输出模型最终回复。
 * 目前没有工具，因此只会经过一个模型节点。后续加入工具后，可以通过
 * metadata.langgraph_node 区分最终答案和工具规划阶段产生的内容。
 */
export async function* streamAgentReply(params: {
  messages: ChatMessage[];
  config: LLMConfig;
  timeoutMs: number;
  signal: AbortSignal;
}): AsyncGenerator<string> {
  const agent = createInterviewAgent(params.config, params.timeoutMs);
  const stream = await agent.stream(
    { messages: toLangChainMessages(params.messages) },
    {
      streamMode: 'messages',
      signal: params.signal,
    },
  );

  for await (const [message] of stream) {
    if (params.signal.aborted) return;
    const delta = readText(message.content);
    if (delta) yield delta;
  }
}
