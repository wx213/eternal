/**
 * 与后端 API 的契约类型
 *
 * 后端已统一 camelCase，前端不再出现 avatar_url / created_at 这类混用字段。
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  plan: string;
}

export type AgentType = 'persona' | 'functional';
export type ContextStrategy = 'trim' | 'summarize';

export interface PersonaProfile {
  summary?: string;
  tone?: string;
  addressing?: string;
  catchphrases?: string[];
  emojiHabit?: string;
  sentenceStyle?: string;
  topics?: string[];
  attitude?: string;
  fewShots?: { user: string; reply: string }[];
}

export interface Agent {
  id: string;
  ownerId: string;
  name: string;
  avatarUrl: string | null;
  description: string;
  type: AgentType;
  model: string | null;
  temperature: number;
  contextStrategy: ContextStrategy;
  systemPrompt: string;
  personaProfile: PersonaProfile | null;
  tools: string[];
  skills: string[];
  createdAt: number;
  updatedAt: number;
  /** 是否已挂载知识库 */
  hasKnowledgeBase: boolean;
}

export interface AgentInput {
  name?: string;
  type?: AgentType;
  description?: string;
  avatarUrl?: string;
  model?: string;
  temperature?: number;
  contextStrategy?: ContextStrategy;
  systemPrompt?: string;
  tools?: string[];
  skills?: string[];
  personaProfile?: PersonaProfile;
}

/** 能力清单项。label 是中文展示名，由后端统一提供，前端不再自己维护映射 */
export interface Capability {
  name: string;
  label: string;
  description: string;
  risky: boolean;
}

export interface CapabilityCatalog {
  tools: Capability[];
  skills: Capability[];
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  status: 'parsing' | 'ready' | 'error' | string;
  error: string | null;
  chunkCount: number;
  createdAt: number;
}

export interface KnowledgeSummary {
  documentCount: number;
  chunkCount: number;
}

export interface Corpus {
  id: string;
  sourceType: string;
  filename: string | null;
  size: number;
  createdAt: number;
}

export interface Conversation {
  id: string;
  ownerId: string;
  agentId: string;
  agentName: string;
  agentAvatarUrl: string | null;
  agentType: string;
  title: string;
  pinned: boolean;
  lastMessage: string;
  lastMessageAt: number | null;
  createdAt: number;
}

/** 工具调用轨迹（与后端 ToolTraceEntry 一致） */
export interface ToolTraceEntry {
  id: string;
  name: string;
  label: string;
  ok: boolean;
  durationMs: number;
  summary: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace: ToolTraceEntry[];
  createdAt: number;
}

/** 轨迹的视图态：工具执行中时先占位，结束后被真实结果替换 */
export interface ToolTraceView extends ToolTraceEntry {
  running?: boolean;
}

/** 前端本地态：流式中的临时消息标记 */
export interface ChatMessage extends Omit<Message, 'trace'> {
  trace: ToolTraceView[];
  /** 正在流式接收 */
  streaming?: boolean;
  /** 思维链内容（仅部分模型提供） */
  reasoning?: string;
  /** 出错文案 */
  error?: string;
}

// ============================================================
// SSE 事件（与后端 core/types.ts 的 AgentEvent 一一对应）
// ============================================================

export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool.start'; id: string; name: string; label: string }
  | {
      type: 'tool.end';
      id: string;
      name: string;
      label: string;
      ok: boolean;
      durationMs: number;
      summary: string;
    }
  | { type: 'done'; text: string; trace: ToolTraceEntry[]; iterations: number }
  | { type: 'error'; code: string; message: string };

/** 后端统一错误响应体 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
