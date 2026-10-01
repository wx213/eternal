/**
 * 上下文管理：裁剪 / 摘要
 *
 * 关键修正（原内核缺失）：
 * OpenAI 协议要求每条 role=tool 的消息必须紧随包含对应 tool_call_id 的 assistant 消息之后。
 * 直接按条数 slice 会切断这个配对，导致后续请求被上游拒绝（400）。
 * 这里以「回合」为最小裁剪单位，保证配对永不破裂。
 */
import type { ChatMessage, ContextStrategy, LlmClient } from './types.js';
import { buildSummaryPrompt } from './prompt.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('context');

/** 一个原子回合：user 消息 + 其后所有 assistant/tool 消息，不可拆分 */
interface Turn {
  messages: ChatMessage[];
}

function splitIntoTurns(history: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const message of history) {
    if (message.role === 'user') {
      if (current) turns.push(current);
      current = { messages: [message] };
      continue;
    }
    // 首条不是 user（例如注入的知识块）时也单独成组，保证不丢消息
    current ??= { messages: [] };
    current.messages.push(message);
  }
  if (current) turns.push(current);

  return turns;
}

function flatten(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn) => turn.messages);
}

function renderTranscript(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      switch (message.role) {
        case 'user':
          return `用户：${message.content}`;
        case 'assistant':
          return message.content ? `助手：${message.content}` : '助手：（调用了工具）';
        case 'tool':
          return `工具「${message.name}」返回：${message.content.slice(0, 500)}`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}

export interface ManageContextInput {
  /** 系统消息（base / memory / knowledge），永不裁剪 */
  systemMessages: ChatMessage[];
  history: ChatMessage[];
  strategy: ContextStrategy;
  maxHistoryMessages: number;
  llm: LlmClient;
  signal?: AbortSignal;
}

export interface ManagedContext {
  history: ChatMessage[];
  /** 摘要策略产生的摘要，需由调用方持久化到会话里 */
  summary?: string;
}

/**
 * 压缩历史消息。
 * @returns 压缩后的历史（不含系统消息）
 */
export async function manageContext(input: ManageContextInput): Promise<ManagedContext> {
  const { history, strategy, maxHistoryMessages } = input;

  if (history.length <= maxHistoryMessages) {
    return { history };
  }

  const turns = splitIntoTurns(history);

  // 从最新回合往前保留，直到达到条数上限；至少保留最后一个回合
  const kept: Turn[] = [];
  let count = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i]!;
    if (kept.length > 0 && count + turn.messages.length > maxHistoryMessages) break;
    kept.unshift(turn);
    count += turn.messages.length;
  }

  const dropped = turns.slice(0, turns.length - kept.length);
  if (dropped.length === 0) {
    return { history: flatten(kept) };
  }

  if (strategy === 'trim') {
    log.debug('历史已裁剪', { droppedTurns: dropped.length, keptMessages: count });
    return { history: flatten(kept) };
  }

  // summarize：把被丢弃的回合压成一段摘要，作为一条 user 消息前置
  try {
    const transcript = renderTranscript(flatten(dropped));
    const summary = await input.llm.complete(buildSummaryPrompt(transcript), {
      temperature: 0.2,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const trimmedSummary = summary.trim();

    if (!trimmedSummary) {
      return { history: flatten(kept) };
    }

    log.debug('历史已摘要', { droppedTurns: dropped.length, summaryLength: trimmedSummary.length });
    return {
      history: [{ role: 'user', content: `【早前对话摘要】\n${trimmedSummary}` }, ...flatten(kept)],
      summary: trimmedSummary,
    };
  } catch (error) {
    log.warn('摘要失败，回退为直接裁剪', { error });
    return { history: flatten(kept) };
  }
}

/**
 * 移除历史里已失效的注入型系统消息（如上一轮的知识块）。
 * 知识块只对当轮有效，留着会污染后续判断并浪费 token。
 */
export function stripEphemeralSystemMessages(history: ChatMessage[]): ChatMessage[] {
  return history.filter((message) => !(message.role === 'system' && message.kind === 'knowledge'));
}
