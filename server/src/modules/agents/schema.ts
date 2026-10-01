/**
 * Agent 接口入参校验
 *
 * 工具与技能名一律对照注册表校验：只要注册表里没有，就直接拒绝，
 * 避免脏名字落库后在运行时被静默忽略（原实现会存下任意字符串）。
 */
import { z } from 'zod';
import { isKnownSkill, isKnownTool } from '../../capabilities/registry.js';

const toolNames = z
  .array(z.string().max(60))
  .max(30)
  .refine((names) => names.every(isKnownTool), { message: '包含未注册的工具' });

const skillNames = z
  .array(z.string().max(60))
  .max(30)
  .refine((names) => names.every(isKnownSkill), { message: '包含未注册的技能' });

export const personaProfileSchema = z.object({
  summary: z.string().max(300).optional(),
  tone: z.string().max(120).optional(),
  addressing: z.string().max(120).optional(),
  catchphrases: z.array(z.string().max(60)).max(12).optional(),
  emojiHabit: z.string().max(200).optional(),
  sentenceStyle: z.string().max(200).optional(),
  topics: z.array(z.string().max(60)).max(15).optional(),
  attitude: z.string().max(200).optional(),
  fewShots: z.array(z.object({ user: z.string().max(300), reply: z.string().max(600) })).max(8).optional(),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(40),
  type: z.enum(['persona', 'functional']).default('functional'),
  description: z.string().trim().max(500).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().max(80).optional(),
  temperature: z.number().min(0).max(2).optional(),
  contextStrategy: z.enum(['trim', 'summarize']).optional(),
  systemPrompt: z.string().max(8000).optional(),
  tools: toolNames.optional(),
  skills: skillNames.optional(),
  personaProfile: personaProfileSchema.optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export const agentIdParamSchema = z.object({
  id: z.string().min(1).max(40),
});

export const corpusBodySchema = z.object({
  profileText: z.string().trim().min(1).max(100_000).optional(),
});

export const extractPersonaSchema = z.object({
  speaker: z.string().trim().min(1).max(40).optional(),
});

export const knowledgeTextSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  text: z.string().trim().min(1).max(300_000).optional(),
});

export const conversationScopedQuerySchema = z.object({
  conversationId: z.string().min(1).max(40),
});
