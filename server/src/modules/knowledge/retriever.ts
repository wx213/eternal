/**
 * 向量检索器
 *
 * 规模定位：单 Agent 知识库通常在千级切片以内，内存内暴力余弦足够快（毫秒级），
 * 因此不引入 FAISS 这类原生依赖（faiss-node 需要编译，跨平台部署成本高）。
 * 切片按 agentId 加载，天然保证一个 Agent 只能检索自己的知识。
 */
import { env } from '../../config/env.js';
import { createLogger } from '../../shared/logger.js';
import type { KnowledgeHit, KnowledgeRetriever, LlmClient } from '../../core/types.js';
import { countChunks, decodeEmbedding, listChunks } from './repo.js';

const log = createLogger('knowledge');

interface LoadedChunk {
  content: string;
  source: string;
  vector: Float32Array;
  norm: number;
}

function l2Norm(vector: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i]! * vector[i]!;
  return Math.sqrt(sum);
}

function cosine(a: Float32Array, aNorm: number, b: Float32Array, bNorm: number): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += a[i]! * b[i]!;
  return dot / (aNorm * bNorm);
}

export class SqliteRetriever implements KnowledgeRetriever {
  private chunks: LoadedChunk[] | null = null;

  constructor(
    private readonly agentId: string,
    private readonly llm: LlmClient,
  ) {}

  private load(): LoadedChunk[] {
    if (this.chunks) return this.chunks;

    this.chunks = listChunks(this.agentId).map((row) => {
      const vector = decodeEmbedding(row.embedding, row.dim);
      return { content: row.content, source: row.source, vector, norm: l2Norm(vector) };
    });

    log.debug('知识切片已载入', { agentId: this.agentId, count: this.chunks.length });
    return this.chunks;
  }

  async retrieve(query: string, topK = env.rag.topK): Promise<KnowledgeHit[]> {
    const chunks = this.load();
    if (chunks.length === 0) return [];

    const [queryVector] = await this.llm.embed([query]);
    if (!queryVector) return [];

    const vector = new Float32Array(queryVector);
    const norm = l2Norm(vector);

    return chunks
      .map((chunk) => ({
        content: chunk.content,
        source: chunk.source,
        score: cosine(vector, norm, chunk.vector, chunk.norm),
      }))
      .filter((hit) => hit.score >= env.rag.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }
}

/** 检索器缓存：按 agentId + 切片数量做版本判断，知识库变更后自动重建 */
const cache = new Map<string, { retriever: SqliteRetriever; version: number }>();

export function getRetriever(agentId: string, llm: LlmClient): KnowledgeRetriever | null {
  const version = countChunks(agentId);
  if (version === 0) {
    cache.delete(agentId);
    return null;
  }

  const cached = cache.get(agentId);
  if (cached && cached.version === version) return cached.retriever;

  const retriever = new SqliteRetriever(agentId, llm);
  cache.set(agentId, { retriever, version });
  return retriever;
}

export function invalidateRetriever(agentId: string): void {
  cache.delete(agentId);
}
