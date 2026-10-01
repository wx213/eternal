/**
 * Agent 领域模型
 *
 * 统一使用 camelCase 对外。原实现直接把 SQLite 行（snake_case）返回给前端，
 * 但入参又是 camelCase，导致前端同时存在 avatar_url 和 avatarUrl 两套字段名。
 * 这里在 repo 层完成一次映射，边界之外只有一种命名。
 */

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

export interface AgentRecord {
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
}

export interface AgentCreateInput {
  name: string;
  type: AgentType;
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

export type AgentUpdateInput = Partial<AgentCreateInput>;
