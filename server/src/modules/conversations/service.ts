/**
 * 会话编排服务
 *
 * 这一层负责「持久化 + 内核调用」的编排，HTTP/SSE 细节留在 routes。
 * 原实现把 SSE 协议、落库、trace 组装、中止全部塞在一个 100 行的控制器回调里，
 * 拆开后这段逻辑可以脱离 Express 独立测试。
 */
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { deriveSessionId } from '../../shared/ids.js';
import { createLogger } from '../../shared/logger.js';
import { getRuntimePool } from '../../runtime/pool.js';
import { requireAgent } from '../agents/service.js';
import type { AgentEvent, ChatMessage, ToolTraceEntry } from '../../core/types.js';
import * as repo from './repo.js';

const log = createLogger('conversations');

export function listConversations(ownerId: string) {
  return repo.listByOwner(ownerId);
}

export function openConversation(ownerId: string, agentId: string) {
  const agent = requireAgent(ownerId, agentId);
  return repo.getOrCreateByAgent(ownerId, agentId, agent.name);
}

export function requireConversation(ownerId: string, conversationId: string) {
  const conversation = repo.findById(ownerId, conversationId);
  if (!conversation) throw AppError.notFound('会话不存在');
  return conversation;
}

export function listMessages(ownerId: string, conversationId: string) {
  requireConversation(ownerId, conversationId);
  return repo.listMessages(conversationId);
}

export function setPinned(ownerId: string, conversationId: string, pinned: boolean) {
  requireConversation(ownerId, conversationId);
  repo.setPinned(ownerId, conversationId, pinned);
  return repo.findById(ownerId, conversationId)!;
}

/** DB 消息 -> 内核上下文消息 */
function toChatMessages(messages: repo.MessageRecord[]): ChatMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .map((message) =>
      message.role === 'user'
        ? ({ role: 'user', content: message.content } as const)
        : ({ role: 'assistant', content: message.content } as const),
    );
}

export interface StreamReplyInput {
  ownerId: string;
  conversationId: string;
  message: string;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

export interface StreamReplyResult {
  text: string;
  trace: ToolTraceEntry[];
  aborted: boolean;
  userMessageId: string;
  assistantMessageId: string | null;
}

/**
 * 发送用户消息并流式产出回复。
 *
 * 落库时机：用户消息先落库（保证用户输入不丢），助手消息在生成结束后落库。
 * 若中途被中止且已产出部分内容，也会落库这部分，避免用户看到的内容刷新后消失。
 */
export async function streamReply(input: StreamReplyInput): Promise<StreamReplyResult> {
  const conversation = requireConversation(input.ownerId, input.conversationId);
  const agent = requireAgent(input.ownerId, conversation.agentId);

  // sessionId 由服务端派生，绝不采信客户端传值
  const sessionId = deriveSessionId(input.ownerId, conversation.id);

  const userMessage = repo.appendMessage({
    conversationId: conversation.id,
    role: 'user',
    content: input.message,
  });
  repo.touch(input.ownerId, conversation.id, input.message);

  const runtime = getRuntimePool().acquire(agent);

  // 进程重启或会话被回收后，用落库历史预热上下文，保证对话连续
  runtime.hydrate(sessionId, toChatMessages(repo.listRecentMessages(conversation.id, env.agent.maxHistoryMessages)));

  const result = await runtime.chat({
    sessionId,
    message: input.message,
    signal: input.signal,
    onEvent: input.onEvent,
  });

  let assistantMessageId: string | null = null;
  if (result.text.trim()) {
    const assistantMessage = repo.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: result.text,
      trace: result.trace,
    });
    assistantMessageId = assistantMessage.id;
    repo.touch(input.ownerId, conversation.id, result.text);
  }

  log.debug('回复完成', {
    conversationId: conversation.id,
    aborted: result.aborted,
    iterations: result.iterations,
    tools: result.trace.length,
  });

  return {
    text: result.text,
    trace: result.trace,
    aborted: result.aborted,
    userMessageId: userMessage.id,
    assistantMessageId,
  };
}

/** 中止某会话正在进行的回复 */
export function abortReply(ownerId: string, conversationId: string): boolean {
  const conversation = requireConversation(ownerId, conversationId);
  const agent = requireAgent(ownerId, conversation.agentId);
  const sessionId = deriveSessionId(ownerId, conversation.id);
  return getRuntimePool().acquire(agent).abort(sessionId, 'user.stop');
}
