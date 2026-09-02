import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import type { LLMConfig } from '@ai-chat/shared';

const CHAT_COMPLETIONS_PATH = /\/chat\/completions\/?$/;

/**
 * LangChain 需要 API 基础地址，而现有适配器保存的是完整的聊天补全接口地址。
 * 这里不改变公共配置，只在智能体边界将地址转换成 LangChain 需要的格式。
 */
export function toApiBaseUrl(apiUrl: string): string {
  return apiUrl.replace(CHAT_COMPLETIONS_PATH, '');
}

/**
 * 创建一个最小可用的智能体：目前只有大模型驱动的执行循环，尚未配置工具。
 * 后续可以把普通工具和 RAG 检索器加入 tools 数组。
 */
export function createInterviewAgent(config: LLMConfig, timeoutMs: number) {
  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0,
    timeout: timeoutMs,
    maxRetries: 1,
    // 部分兼容 OpenAI 接口的模型服务不支持 stream_options 参数。
    streamUsage: false,
    configuration: {
      baseURL: toApiBaseUrl(config.apiUrl),
    },
    modelKwargs: {
      thinking: { type: 'disabled' },
    },
  });

  return createAgent({
    model,
    tools: [],
    systemPrompt:
      '你是一名可靠、友好的 AI 助手。请基于已知信息回答；不确定时明确说明，不要编造事实。',
    name: 'interview_assistant',
  });
}
