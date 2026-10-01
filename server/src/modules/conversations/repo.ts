import { db } from '../../db/index.js';
import { newId } from '../../shared/ids.js';
import type { ToolTraceEntry } from '../../core/types.js';

export interface ConversationRecord {
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

export interface MessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace: ToolTraceEntry[];
  createdAt: number;
}

interface ConversationRow {
  id: string;
  owner_id: string;
  agent_id: string;
  title: string;
  pinned: number;
  last_message: string;
  last_message_at: number | null;
  created_at: number;
  agent_name?: string;
  agent_avatar_url?: string | null;
  agent_type?: string;
}

function toRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id,
    agentName: row.agent_name ?? '',
    agentAvatarUrl: row.agent_avatar_url ?? null,
    agentType: row.agent_type ?? 'functional',
    title: row.title,
    pinned: row.pinned === 1,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_AGENT = `
  SELECT c.*, a.name AS agent_name, a.avatar_url AS agent_avatar_url, a.type AS agent_type
  FROM conversations c
  JOIN agents a ON a.id = c.agent_id
`;

export function listByOwner(ownerId: string): ConversationRecord[] {
  const rows = db
    .prepare(
      `${SELECT_WITH_AGENT}
       WHERE c.owner_id = ? AND a.status = 'active'
       ORDER BY c.pinned DESC, COALESCE(c.last_message_at, c.created_at) DESC`,
    )
    .all(ownerId) as ConversationRow[];
  return rows.map(toRecord);
}

export function findById(ownerId: string, id: string): ConversationRecord | null {
  const row = db.prepare(`${SELECT_WITH_AGENT} WHERE c.id = ? AND c.owner_id = ?`).get(id, ownerId) as
    | ConversationRow
    | undefined;
  return row ? toRecord(row) : null;
}

/** 一个 (owner, agent) 只保留一条长期会话，符合 IM 心智 */
export function getOrCreateByAgent(ownerId: string, agentId: string, title: string): ConversationRecord {
  const existing = db
    .prepare(`SELECT id FROM conversations WHERE owner_id = ? AND agent_id = ?`)
    .get(ownerId, agentId) as { id: string } | undefined;

  if (existing) return findById(ownerId, existing.id)!;

  const id = newId();
  db.prepare(
    `INSERT INTO conversations (id, owner_id, agent_id, title, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, ownerId, agentId, title, Date.now());

  return findById(ownerId, id)!;
}

export function touch(ownerId: string, id: string, lastMessage: string): void {
  db.prepare(`UPDATE conversations SET last_message = ?, last_message_at = ? WHERE id = ? AND owner_id = ?`).run(
    lastMessage.slice(0, 200),
    Date.now(),
    id,
    ownerId,
  );
}

export function setPinned(ownerId: string, id: string, pinned: boolean): boolean {
  const result = db
    .prepare(`UPDATE conversations SET pinned = ? WHERE id = ? AND owner_id = ?`)
    .run(pinned ? 1 : 0, id, ownerId);
  return result.changes > 0;
}

export function appendMessage(input: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  trace?: ToolTraceEntry[];
}): MessageRecord {
  const id = newId();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, trace, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.conversationId, input.role, input.content, JSON.stringify(input.trace ?? []), createdAt);

  return { id, role: input.role, content: input.content, trace: input.trace ?? [], createdAt };
}

export function listMessages(conversationId: string, limit = 200): MessageRecord[] {
  const rows = db
    .prepare(
      `SELECT id, role, content, trace, created_at FROM messages
       WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?`,
    )
    .all(conversationId, limit) as {
    id: string;
    role: string;
    content: string;
    trace: string;
    created_at: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content,
    trace: parseTrace(row.trace),
    createdAt: row.created_at,
  }));
}

/** 取最近若干条用于预热内核上下文（按时间正序返回） */
export function listRecentMessages(conversationId: string, limit: number): MessageRecord[] {
  const rows = db
    .prepare(
      `SELECT id, role, content, trace, created_at FROM messages
       WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(conversationId, limit) as {
    id: string;
    role: string;
    content: string;
    trace: string;
    created_at: number;
  }[];

  return rows
    .map((row) => ({
      id: row.id,
      role: (row.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: row.content,
      trace: parseTrace(row.trace),
      createdAt: row.created_at,
    }))
    .reverse();
}

function parseTrace(raw: string): ToolTraceEntry[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ToolTraceEntry[]) : [];
  } catch {
    return [];
  }
}
