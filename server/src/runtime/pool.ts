/**
 * 多 Agent 运行时池
 *
 * 一个 Agent 记录对应一个内核实例（持有该 Agent 的会话上下文）。
 * 缓存键是 agentId，缓存版本由「配置更新时间 + 知识库切片数」组成，
 * 因此改配置或改知识库后，下次取用会自动重建实例。
 */
import { env } from '../config/env.js';
import { Agent } from '../core/agent.js';
import { getLlmClient } from '../core/llm.js';
import { FileMemoryStore, MemoryManager } from '../core/memory.js';
import { createLogger } from '../shared/logger.js';
import { getRetriever } from '../modules/knowledge/retriever.js';
import * as knowledgeRepo from '../modules/knowledge/repo.js';
import type { AgentRecord } from '../modules/agents/types.js';
import { assembleAgentConfig } from './assembler.js';

const log = createLogger('runtime');

interface PoolEntry {
  agent: Agent;
  version: string;
  lastActiveAt: number;
}

class AgentRuntimePool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly memory: MemoryManager;

  constructor() {
    const llm = getLlmClient();
    this.memory = new MemoryManager({
      store: new FileMemoryStore(),
      llm,
      updateInterval: env.memory.updateInterval,
      maxLength: env.memory.maxLength,
    });
  }

  get memoryManager(): MemoryManager {
    return this.memory;
  }

  /** 取得（必要时重建）某 Agent 的运行时实例 */
  acquire(record: AgentRecord): Agent {
    this.evictExpired();

    const chunkCount = knowledgeRepo.countChunks(record.id);
    const version = `${record.updatedAt}:${chunkCount}`;

    const cached = this.entries.get(record.id);
    if (cached && cached.version === version) {
      cached.lastActiveAt = Date.now();
      return cached.agent;
    }

    if (cached) {
      // 配置已变更，中止旧实例在途请求后丢弃
      cached.agent.shutdown();
      log.debug('运行时因配置变更重建', { agentId: record.id });
    }

    const llm = getLlmClient();
    const config = assembleAgentConfig(record, { hasKnowledgeBase: chunkCount > 0 });
    const agent = new Agent(config, {
      llm,
      retriever: getRetriever(record.id, llm),
      memory: env.memory.enabled ? this.memory : null,
    });

    this.entries.set(record.id, { agent, version, lastActiveAt: Date.now() });
    this.evictOverflow();

    log.info('运行时已就绪', {
      agentId: record.id,
      tools: config.tools.map((tool) => tool.name),
      knowledgeChunks: chunkCount,
    });

    return agent;
  }

  /** 配置/知识库变更后主动失效（不等下次版本比对） */
  invalidate(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (!entry) return;
    entry.agent.shutdown();
    this.entries.delete(agentId);
  }

  get size(): number {
    return this.entries.size;
  }

  shutdown(): void {
    for (const entry of this.entries.values()) entry.agent.shutdown();
    this.entries.clear();
  }

  private evictExpired(): void {
    const deadline = Date.now() - env.runtime.agentTtlMs;
    for (const [agentId, entry] of this.entries) {
      if (entry.lastActiveAt < deadline) {
        entry.agent.shutdown();
        this.entries.delete(agentId);
      }
    }
  }

  private evictOverflow(): void {
    if (this.entries.size <= env.runtime.maxAgents) return;

    const sorted = [...this.entries.entries()].sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
    const overflow = this.entries.size - env.runtime.maxAgents;

    for (let i = 0; i < overflow; i += 1) {
      const [agentId, entry] = sorted[i]!;
      entry.agent.shutdown();
      this.entries.delete(agentId);
    }
  }
}

let pool: AgentRuntimePool | null = null;

export function getRuntimePool(): AgentRuntimePool {
  pool ??= new AgentRuntimePool();
  return pool;
}
