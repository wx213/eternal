/**
 * 知识库数据访问
 *
 * 向量以 Float32 BLOB 存储（比 JSON 数组省 ~60% 空间且解析更快）。
 * 所有查询都带 owner_id / agent_id 条件，从数据层杜绝跨用户与跨 Agent 读取。
 */
import { db } from '../../db/index.js';
import { newId } from '../../shared/ids.js';

export interface KbDocumentRow {
  id: string;
  agent_id: string;
  owner_id: string;
  filename: string;
  status: string;
  error: string | null;
  chunk_count: number;
  created_at: number;
}

export interface KbChunkRow {
  id: string;
  content: string;
  source: string;
  dim: number;
  embedding: Buffer;
}

export function encodeEmbedding(vector: number[]): Buffer {
  const floats = new Float32Array(vector);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function decodeEmbedding(buffer: Buffer, dim: number): Float32Array {
  // Buffer 可能是共享内存的视图，必须按 byteOffset 精确取值
  return new Float32Array(buffer.buffer, buffer.byteOffset, dim);
}

export function createDocument(input: {
  agentId: string;
  ownerId: string;
  filename: string;
}): KbDocumentRow {
  const id = newId();
  db.prepare(
    `INSERT INTO kb_documents (id, agent_id, owner_id, filename, status, chunk_count, created_at)
     VALUES (?, ?, ?, ?, 'parsing', 0, ?)`,
  ).run(id, input.agentId, input.ownerId, input.filename, Date.now());
  return getDocument(input.ownerId, input.agentId, id)!;
}

export function getDocument(ownerId: string, agentId: string, docId: string): KbDocumentRow | undefined {
  return db
    .prepare(`SELECT * FROM kb_documents WHERE id = ? AND agent_id = ? AND owner_id = ?`)
    .get(docId, agentId, ownerId) as KbDocumentRow | undefined;
}

export function listDocuments(ownerId: string, agentId: string): KbDocumentRow[] {
  return db
    .prepare(`SELECT * FROM kb_documents WHERE agent_id = ? AND owner_id = ? ORDER BY created_at DESC`)
    .all(agentId, ownerId) as KbDocumentRow[];
}

/** 写入切片并把文档标记为就绪，整体在一个事务里完成 */
export function saveChunks(input: {
  docId: string;
  agentId: string;
  source: string;
  chunks: { content: string; embedding: number[] }[];
}): void {
  const insert = db.prepare(
    `INSERT INTO kb_chunks (id, doc_id, agent_id, seq, content, source, dim, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const markReady = db.prepare(`UPDATE kb_documents SET status = 'ready', chunk_count = ?, error = NULL WHERE id = ?`);

  const run = db.transaction(() => {
    const now = Date.now();
    input.chunks.forEach((chunk, seq) => {
      insert.run(
        newId(),
        input.docId,
        input.agentId,
        seq,
        chunk.content,
        input.source,
        chunk.embedding.length,
        encodeEmbedding(chunk.embedding),
        now,
      );
    });
    markReady.run(input.chunks.length, input.docId);
  });

  run();
}

export function markDocumentFailed(docId: string, error: string): void {
  db.prepare(`UPDATE kb_documents SET status = 'error', error = ? WHERE id = ?`).run(error.slice(0, 300), docId);
}

export function deleteDocument(ownerId: string, agentId: string, docId: string): boolean {
  // chunks 通过外键级联删除
  const result = db
    .prepare(`DELETE FROM kb_documents WHERE id = ? AND agent_id = ? AND owner_id = ?`)
    .run(docId, agentId, ownerId);
  return result.changes > 0;
}

export function listChunks(agentId: string): KbChunkRow[] {
  return db
    .prepare(`SELECT id, content, source, dim, embedding FROM kb_chunks WHERE agent_id = ? ORDER BY seq ASC`)
    .all(agentId) as KbChunkRow[];
}

export function countChunks(agentId: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM kb_chunks WHERE agent_id = ?`).get(agentId) as {
    total: number;
  };
  return row.total;
}
