/**
 * Agent 领域服务
 *
 * 所有入口都以 ownerId 为第一参数，取不到就 404（而不是 403），避免暴露资源是否存在。
 */
import { AppError } from '../../shared/errors.js';
import { deriveSessionId } from '../../shared/ids.js';
import { getRuntimePool } from '../../runtime/pool.js';
import { extractPersonaProfile } from '../persona/extractor.js';
import * as knowledgeService from '../knowledge/service.js';
import * as repo from './repo.js';
import type { AgentCreateInput, AgentRecord, AgentUpdateInput } from './types.js';

/** 单用户 Agent 数量上限，防止刷量占满运行时池 */
const MAX_AGENTS_PER_USER = 100;
const MAX_CORPUS_TOTAL = 200_000;

export interface AgentView extends AgentRecord {
  /** 该 Agent 是否已挂载知识库，前端据此展示标记 */
  hasKnowledgeBase: boolean;
}

function toView(record: AgentRecord): AgentView {
  return { ...record, hasKnowledgeBase: knowledgeService.hasKnowledgeBase(record.id) };
}

export function requireAgent(ownerId: string, agentId: string): AgentRecord {
  const agent = repo.findById(ownerId, agentId);
  if (!agent) throw AppError.notFound('Agent 不存在');
  return agent;
}

export function listAgents(ownerId: string): AgentView[] {
  return repo.listByOwner(ownerId).map(toView);
}

export function getAgent(ownerId: string, agentId: string): AgentView {
  return toView(requireAgent(ownerId, agentId));
}

export function createAgent(ownerId: string, input: AgentCreateInput): AgentView {
  if (repo.countByOwner(ownerId) >= MAX_AGENTS_PER_USER) {
    throw AppError.conflict(`Agent 数量已达上限（${MAX_AGENTS_PER_USER}）`);
  }
  return toView(repo.create(ownerId, input));
}

export function updateAgent(ownerId: string, agentId: string, patch: AgentUpdateInput): AgentView {
  requireAgent(ownerId, agentId);

  const updated = repo.update(ownerId, agentId, patch);
  if (!updated) throw AppError.notFound('Agent 不存在');

  // 配置变了，运行时实例必须重建
  getRuntimePool().invalidate(agentId);
  return toView(updated);
}

export function deleteAgent(ownerId: string, agentId: string): void {
  if (!repo.softDelete(ownerId, agentId)) throw AppError.notFound('Agent 不存在');
  getRuntimePool().invalidate(agentId);
}

// ---------- 拟真人格语料 ----------

export function addCorpus(
  ownerId: string,
  agentId: string,
  input: { sourceType: 'chatlog_file' | 'profile_text'; filename: string | null; content: string },
): { id: string; size: number } {
  requireAgent(ownerId, agentId);

  const content = input.content.trim();
  if (!content) throw AppError.badRequest('语料内容为空');

  const id = repo.addCorpus(agentId, { ...input, content: content.slice(0, MAX_CORPUS_TOTAL) });
  return { id, size: content.length };
}

export function listCorpora(ownerId: string, agentId: string) {
  requireAgent(ownerId, agentId);
  return repo.listCorpora(agentId).map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    filename: row.filename,
    size: row.size,
    createdAt: row.created_at,
  }));
}

export async function extractPersona(ownerId: string, agentId: string, speaker?: string) {
  const agent = requireAgent(ownerId, agentId);

  const corpusText = repo.readCorpusText(agentId, MAX_CORPUS_TOTAL);
  if (!corpusText.trim()) {
    throw AppError.badRequest('该 Agent 还没有语料，请先上传聊天记录或人物设定');
  }

  const profile = await extractPersonaProfile(corpusText, speaker?.trim() || agent.name);

  // 抽取成功即转为人格型
  const updated = repo.update(ownerId, agentId, { personaProfile: profile, type: 'persona' });
  getRuntimePool().invalidate(agentId);

  return { personaProfile: profile, agent: updated ? toView(updated) : toView(agent) };
}

// ---------- 知识库 ----------

export async function addKnowledgeDocument(
  ownerId: string,
  agentId: string,
  input: { filename: string; text: string },
) {
  requireAgent(ownerId, agentId);
  const result = await knowledgeService.ingestDocument({ ownerId, agentId, ...input });
  // 知识库变化会影响工具集与预检索开关，必须重建运行时
  getRuntimePool().invalidate(agentId);
  return result;
}

export function listKnowledgeDocuments(ownerId: string, agentId: string) {
  requireAgent(ownerId, agentId);
  return knowledgeService.listAgentDocuments(ownerId, agentId);
}

export function deleteKnowledgeDocument(ownerId: string, agentId: string, docId: string) {
  requireAgent(ownerId, agentId);
  knowledgeService.removeDocument(ownerId, agentId, docId);
  getRuntimePool().invalidate(agentId);
}

// ---------- 长期记忆 ----------

export async function readMemory(ownerId: string, agentId: string, conversationId: string): Promise<string> {
  requireAgent(ownerId, agentId);
  const sessionId = deriveSessionId(ownerId, conversationId);
  return getRuntimePool().memoryManager.read(sessionId);
}

export async function clearMemory(ownerId: string, agentId: string, conversationId: string): Promise<void> {
  requireAgent(ownerId, agentId);
  const sessionId = deriveSessionId(ownerId, conversationId);
  await getRuntimePool().memoryManager.clear(sessionId);
}
