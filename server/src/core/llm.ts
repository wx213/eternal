/**
 * LLM 客户端（OpenAI 兼容协议）
 *
 * 为什么直接用 openai SDK 而不是 LangChain：
 * 目标服务商（硅基流动 / 阿里百炼兼容模式 / OpenAI / DeepSeek / Ollama）全部是 OpenAI 兼容协议，
 * 直连 SDK 少 4 个依赖包、类型精确，且 reasoning_content 这类非标字段无需 __includeRawResponse 之类的 hack。
 */
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { env } from '../config/env.js';
import { AppError, isAbortError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';
import type { ChatMessage, LlmChatOptions, LlmClient, LlmCompletion, ToolCallRequest } from './types.js';

const log = createLogger('llm');

interface ProviderPreset {
  baseUrl: string;
  chatModel: string;
  fastModel: string;
  embedModel: string;
}

const PROVIDERS: Record<string, ProviderPreset> = {
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    // 主模型必须具备可靠的 function calling：7B 级模型常把工具调用写成正文 JSON，
    // 导致 ReAct 循环拿不到 tool_calls。fastModel 只做摘要/记忆抽取，无需工具能力。
    chatModel: 'Qwen/Qwen3-8B',
    fastModel: 'Qwen/Qwen2.5-7B-Instruct',
    embedModel: 'BAAI/bge-m3',
  },
  dashscope: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatModel: 'qwen-plus',
    fastModel: 'qwen-flash',
    embedModel: 'text-embedding-v4',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    fastModel: 'gpt-4o-mini',
    embedModel: 'text-embedding-3-small',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-chat',
    fastModel: 'deepseek-chat',
    embedModel: 'text-embedding-3-small',
  },
};

function resolvePreset(): ProviderPreset {
  return PROVIDERS[env.llm.provider] ?? PROVIDERS.siliconflow!;
}

/** 把内核消息模型翻译为 OpenAI 消息格式 */
function toOpenAiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message): ChatCompletionMessageParam => {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content };
      case 'user':
        return { role: 'user', content: message.content };
      case 'tool':
        return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
      case 'assistant': {
        const toolCalls = message.toolCalls ?? [];
        if (toolCalls.length === 0) {
          return { role: 'assistant', content: message.content };
        }
        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.rawArgs || '{}' },
          })),
        };
      }
    }
  });
}

function parseToolArgs(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 流式 tool_calls 以 index 分片下发，需要按 index 累积拼装 */
class ToolCallAccumulator {
  private readonly slots = new Map<number, { id: string; name: string; args: string }>();

  push(deltas: ChatCompletionChunk.Choice.Delta.ToolCall[] | undefined): void {
    for (const delta of deltas ?? []) {
      const index = delta.index ?? 0;
      const slot = this.slots.get(index) ?? { id: '', name: '', args: '' };
      if (delta.id) slot.id = delta.id;
      if (delta.function?.name) slot.name += delta.function.name;
      if (delta.function?.arguments) slot.args += delta.function.arguments;
      this.slots.set(index, slot);
    }
  }

  build(): ToolCallRequest[] {
    return [...this.slots.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, slot]) => slot && { ...slot, index })
      .filter((slot): slot is { id: string; name: string; args: string; index: number } => Boolean(slot?.name))
      .map((slot) => ({
        id: slot.id || `call_${slot.index}`,
        name: slot.name,
        args: parseToolArgs(slot.args),
        rawArgs: slot.args || '{}',
      }));
  }
}

function readReasoning(delta: unknown): string {
  // reasoning_content 是 DashScope / DeepSeek 的非标扩展字段
  const value = (delta as { reasoning_content?: unknown } | null)?.reasoning_content;
  return typeof value === 'string' ? value : '';
}

export function createLlmClient(): LlmClient {
  const preset = resolvePreset();
  const baseURL = env.llm.baseUrl ?? preset.baseUrl;
  const chatModel = env.llm.chatModel ?? preset.chatModel;
  const fastModel = env.llm.fastModel ?? preset.fastModel;
  const embedModel = env.llm.embedModel ?? preset.embedModel;

  if (!env.llm.apiKey) {
    log.warn('未配置 LLM_API_KEY，对话与向量化功能将不可用');
  }

  let client: OpenAI | null = null;
  function getClient(): OpenAI {
    if (!env.llm.apiKey) {
      throw new AppError('LLM_NOT_CONFIGURED', '未配置模型 API Key，请在 server/.env 中设置 LLM_API_KEY');
    }
    client ??= new OpenAI({ apiKey: env.llm.apiKey, baseURL, timeout: env.llm.timeoutMs, maxRetries: 0 });
    return client;
  }

  function toOpenAiTools(options: LlmChatOptions): ChatCompletionTool[] | undefined {
    if (!options.tools || options.tools.length === 0) return undefined;
    return options.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  async function chat(options: LlmChatOptions): Promise<LlmCompletion> {
    const tools = toOpenAiTools(options);
    const body = {
      model: options.model ?? chatModel,
      messages: toOpenAiMessages(options.messages),
      temperature: options.temperature ?? env.agent.defaultTemperature,
      ...(tools ? { tools, tool_choice: 'auto' as const } : {}),
    };

    try {
      // 非流式路径
      if (!options.onChunk) {
        const response = await getClient().chat.completions.create(
          { ...body, stream: false },
          { signal: options.signal },
        );
        const choice = response.choices[0];
        const message = choice?.message;
        const toolCalls: ToolCallRequest[] = (message?.tool_calls ?? [])
          .filter((call) => call.type === 'function')
          .map((call) => ({
            id: call.id,
            name: call.function.name,
            args: parseToolArgs(call.function.arguments),
            rawArgs: call.function.arguments || '{}',
          }));
        return {
          text: message?.content ?? '',
          toolCalls,
          finishReason: choice?.finish_reason ?? null,
        };
      }

      // 流式路径
      const stream = await getClient().chat.completions.create({ ...body, stream: true }, { signal: options.signal });

      const accumulator = new ToolCallAccumulator();
      let text = '';
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        const piece = typeof delta?.content === 'string' ? delta.content : '';
        const reasoning = readReasoning(delta);

        if (piece) {
          text += piece;
          options.onChunk({ text: piece });
        }
        if (reasoning) {
          options.onChunk({ reasoning });
        }
        accumulator.push(delta?.tool_calls);
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      return { text, toolCalls: accumulator.build(), finishReason };
    } catch (error) {
      if (isAbortError(error) || error instanceof AppError) throw error;
      log.error('模型调用失败', { error, model: body.model });
      throw AppError.upstream('模型服务调用失败，请稍后重试', error);
    }
  }

  async function complete(
    prompt: string,
    options: { temperature?: number; model?: string; signal?: AbortSignal } = {},
  ): Promise<string> {
    const result = await chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.3,
      model: options.model ?? fastModel,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return result.text;
  }

  async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      const response = await getClient().embeddings.create({ model: embedModel, input: texts });
      return response.data.map((item) => item.embedding);
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error('向量化失败', { error, model: embedModel });
      throw AppError.upstream('文本向量化失败，请检查 embedding 模型配置', error);
    }
  }

  return { chatModel, fastModel, chat, complete, embed };
}

/** 进程级共享客户端：无状态，可安全被所有 Agent 复用 */
let sharedClient: LlmClient | null = null;
export function getLlmClient(): LlmClient {
  sharedClient ??= createLlmClient();
  return sharedClient;
}
