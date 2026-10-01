/**
 * Agent 内核类型契约
 *
 * 这里定义的类型是内核、能力层、HTTP 层之间唯一的沟通语言。
 */
import type { z } from 'zod';
import type { Logger } from '../shared/logger.js';

// ============================================================
// 消息模型
// ============================================================

export interface ToolCallRequest {
  id: string;
  name: string;
  /** 已解析的命名参数；解析失败时为 null，由内核回报给模型纠正 */
  args: Record<string, unknown> | null;
  /** 原始参数字符串，仅用于排查模型输出异常 */
  rawArgs: string;
}

export type ChatMessage =
  | { role: 'system'; content: string; kind?: 'base' | 'memory' | 'knowledge' }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallRequest[] }
  | { role: 'tool'; content: string; toolCallId: string; name: string };

// ============================================================
// 流式事件协议（后端 SSE 与前端消费共用同一套语义）
// ============================================================

export interface ToolTraceEntry {
  id: string;
  name: string;
  label: string;
  ok: boolean;
  durationMs: number;
  summary: string;
}

export type AgentEvent =
  /** 正文增量 */
  | { type: 'delta'; text: string }
  /** 思维链增量（部分模型提供 reasoning_content） */
  | { type: 'reasoning'; text: string }
  /** 工具开始执行 */
  | { type: 'tool.start'; id: string; name: string; label: string }
  /** 工具执行结束 */
  | { type: 'tool.end'; id: string; name: string; label: string; ok: boolean; durationMs: number; summary: string }
  /** 本轮结束 */
  | { type: 'done'; text: string; trace: ToolTraceEntry[]; iterations: number }
  /** 出错（非中止） */
  | { type: 'error'; code: string; message: string };

export type AgentEventSink = (event: AgentEvent) => void;

// ============================================================
// 能力（工具）契约
// ============================================================

/** 工具执行上下文：一切外部依赖显式注入，内核不使用任何全局可变状态 */
export interface ToolContext {
  ownerId: string;
  agentId: string;
  sessionId: string;
  signal: AbortSignal;
  logger: Logger;
  /** 知识检索器，未挂知识库时为 null */
  retriever: KnowledgeRetriever | null;
  /** 供工具内部做二次 LLM 调用（如摘要），与主链路共享配置但独立计费 */
  llm: LlmClient;
}

export type ToolOutcome =
  | { ok: true; data: unknown; summary?: string }
  | { ok: false; error: string; retryable?: boolean };

/** 工具定义。schema 使用 zod，保证「模型看到的参数」与「运行时校验」永远一致 */
export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** 面向用户的中文名，用于前端过程可视化 */
  label: string;
  description: string;
  schema: S;
  /** 高危能力标记，创建 Agent 时默认不勾选 */
  risky?: boolean;
  /** 注入系统提示词的使用建议，让规则跟着能力走而不是硬编码在提示词里 */
  guidance?: string;
  execute(args: z.infer<S>, ctx: ToolContext): Promise<ToolOutcome>;
}

// ============================================================
// LLM 客户端契约
// ============================================================

export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmStreamChunk {
  text?: string;
  reasoning?: string;
}

export interface LlmCompletion {
  text: string;
  toolCalls: ToolCallRequest[];
  finishReason: string | null;
}

export interface LlmChatOptions {
  messages: ChatMessage[];
  tools?: LlmToolSchema[];
  temperature?: number;
  model?: string;
  signal?: AbortSignal;
  /** 提供时走流式，并逐块回调 */
  onChunk?: (chunk: LlmStreamChunk) => void;
}

export interface LlmClient {
  readonly chatModel: string;
  readonly fastModel: string;
  chat(options: LlmChatOptions): Promise<LlmCompletion>;
  /** 轻量补全，用于摘要 / 记忆抽取等内部任务，不带工具 */
  complete(prompt: string, options?: { temperature?: number; model?: string; signal?: AbortSignal }): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}

// ============================================================
// 知识检索
// ============================================================

export interface KnowledgeHit {
  content: string;
  source: string;
  score: number;
}

export interface KnowledgeRetriever {
  retrieve(query: string, topK?: number): Promise<KnowledgeHit[]>;
}

// ============================================================
// 长期记忆
// ============================================================

export interface MemoryStore {
  read(sessionId: string): Promise<string>;
  write(sessionId: string, content: string): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

// ============================================================
// Agent 配置
// ============================================================

export type ContextStrategy = 'trim' | 'summarize';

export interface AgentConfig {
  agentId: string;
  ownerId: string;
  /** 角色名，进系统提示词 */
  name: string;
  /** 角色描述或完整人格提示词 */
  instructions: string;
  model?: string;
  temperature: number;
  maxIterations: number;
  maxHistoryMessages: number;
  contextStrategy: ContextStrategy;
  /** 该 Agent 实际可用的工具（已按白名单裁剪） */
  tools: ToolDefinition[];
  /** 是否在每轮主动预检索知识库 */
  knowledgePrefetch: boolean;
  memoryEnabled: boolean;
}

export interface ChatRequestOptions {
  sessionId: string;
  message: string;
  signal: AbortSignal;
  onEvent: AgentEventSink;
}

export interface ChatResult {
  text: string;
  trace: ToolTraceEntry[];
  iterations: number;
  aborted: boolean;
}
