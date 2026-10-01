/**
 * Agent 数据访问
 *
 * 安全约定：所有读写都必须带 owner_id 条件。
 * 这是越权防护的最后一道也是最可靠的一道闸门——即便上层忘了校验，数据层也查不到别人的数据。
 */
import { db } from '../../db/index.js';
import { newId } from '../../shared/ids.js';
import type { AgentCreateInput, AgentRecord, AgentType, ContextStrategy, AgentUpdateInput, PersonaProfile } from './types.js';

interface AgentRow {
  id: string;
  owner_id: string;
  name: string;
  avatar_url: string | null;
  description: string;
  type: string;
  model: string | null;
  temperature: number;
  context_strategy: string;
  system_prompt: string;
  persona_profile: string | null;
  tools: string;
  skills: string;
  status: string;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    description: row.description,
    type: (row.type === 'persona' ? 'persona' : 'functional') as AgentType,
    model: row.model,
    temperature: row.temperature,
    contextStrategy: (row.context_strategy === 'summarize' ? 'summarize' : 'trim') as ContextStrategy,
    systemPrompt: row.system_prompt,
    personaProfile: parseJson<PersonaProfile | null>(row.persona_profile, null),
    tools: parseJson<string[]>(row.tools, []),
    skills: parseJson<string[]>(row.skills, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function create(ownerId: string, input: AgentCreateInput): AgentRecord {
  const id = newId();
  const now = Date.now();

  db.prepare(
    `INSERT INTO agents
       (id, owner_id, name, avatar_url, description, type, model, temperature,
        context_strategy, system_prompt, persona_profile, tools, skills, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ownerId,
    input.name,
    input.avatarUrl ?? null,
    input.description ?? '',
    input.type,
    input.model ?? null,
    input.temperature ?? 0.7,
    input.contextStrategy ?? 'trim',
    input.systemPrompt ?? '',
    input.personaProfile ? JSON.stringify(input.personaProfile) : null,
    JSON.stringify(input.tools ?? []),
    JSON.stringify(input.skills ?? []),
    now,
    now,
  );

  return findById(ownerId, id)!;
}

export function findById(ownerId: string, id: string): AgentRecord | null {
  const row = db
    .prepare(`SELECT * FROM agents WHERE id = ? AND owner_id = ? AND status = 'active'`)
    .get(id, ownerId) as AgentRow | undefined;
  return row ? toRecord(row) : null;
}

export function listByOwner(ownerId: string): AgentRecord[] {
  const rows = db
    .prepare(`SELECT * FROM agents WHERE owner_id = ? AND status = 'active' ORDER BY updated_at DESC`)
    .all(ownerId) as AgentRow[];
  return rows.map(toRecord);
}

/** 字段白名单映射，避免把任意键拼进 SQL */
const COLUMN_MAP: Record<keyof AgentUpdateInput, string> = {
  name: 'name',
  type: 'type',
  description: 'description',
  avatarUrl: 'avatar_url',
  model: 'model',
  temperature: 'temperature',
  contextStrategy: 'context_strategy',
  systemPrompt: 'system_prompt',
  tools: 'tools',
  skills: 'skills',
  personaProfile: 'persona_profile',
};

const JSON_FIELDS = new Set<keyof AgentUpdateInput>(['tools', 'skills', 'personaProfile']);

export function update(ownerId: string, id: string, patch: AgentUpdateInput): AgentRecord | null {
  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const [key, column] of Object.entries(COLUMN_MAP) as [keyof AgentUpdateInput, string][]) {
    const value = patch[key];
    if (value === undefined) continue;

    assignments.push(`${column} = ?`);
    if (JSON_FIELDS.has(key)) {
      values.push(value === null ? null : JSON.stringify(value));
    } else {
      values.push(value);
    }
  }

  if (assignments.length === 0) return findById(ownerId, id);

  assignments.push('updated_at = ?');
  values.push(Date.now(), id, ownerId);

  const result = db
    .prepare(`UPDATE agents SET ${assignments.join(', ')} WHERE id = ? AND owner_id = ? AND status = 'active'`)
    .run(...(values as never[]));

  return result.changes > 0 ? findById(ownerId, id) : null;
}

export function softDelete(ownerId: string, id: string): boolean {
  const result = db
    .prepare(`UPDATE agents SET status = 'deleted', updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'active'`)
    .run(Date.now(), id, ownerId);
  return result.changes > 0;
}

export function countByOwner(ownerId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM agents WHERE owner_id = ? AND status = 'active'`)
    .get(ownerId) as { total: number };
  return row.total;
}

// ---------- 语料（拟真人格用） ----------

export interface CorpusRow {
  id: string;
  source_type: string;
  filename: string | null;
  size: number;
  created_at: number;
}

export function addCorpus(agentId: string, input: { sourceType: string; filename: string | null; content: string }): string {
  const id = newId();
  db.prepare(
    `INSERT INTO corpora (id, agent_id, source_type, filename, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, agentId, input.sourceType, input.filename, input.content, Date.now());
  return id;
}

export function listCorpora(agentId: string): CorpusRow[] {
  return db
    .prepare(
      `SELECT id, source_type, filename, LENGTH(content) AS size, created_at
       FROM corpora WHERE agent_id = ? ORDER BY created_at DESC`,
    )
    .all(agentId) as CorpusRow[];
}

export function readCorpusText(agentId: string, maxLength: number): string {
  const rows = db.prepare(`SELECT content FROM corpora WHERE agent_id = ? ORDER BY created_at ASC`).all(agentId) as {
    content: string;
  }[];
  return rows
    .map((row) => row.content)
    .join('\n\n')
    .slice(0, maxLength);
}
