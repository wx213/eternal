/**
 * 长期记忆
 *
 * 存储：每个 sessionId 一个文本文件。sessionId 由服务端从 (userId, conversationId) 派生，
 * 因此记忆天然按用户与会话隔离；写入前再做一次文件名净化，防目录遍历。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { buildMemoryExtractionPrompt } from './prompt.js';
import type { ChatMessage, LlmClient, MemoryStore } from './types.js';

const log = createLogger('memory');

const MEMORY_DIR = path.join(env.paths.dataDir, 'memory');

/** 只允许字母数字与下划线，杜绝 ../ 之类的路径穿越 */
function safeKey(sessionId: string): string {
  const normalized = sessionId.replace(/[^a-zA-Z0-9_]/g, '');
  if (!normalized) throw new Error('非法的 sessionId');
  return normalized.slice(0, 120);
}

export class FileMemoryStore implements MemoryStore {
  private fileOf(sessionId: string): string {
    return path.join(MEMORY_DIR, `${safeKey(sessionId)}.txt`);
  }

  async read(sessionId: string): Promise<string> {
    try {
      return await fs.readFile(this.fileOf(sessionId), 'utf-8');
    } catch {
      return '';
    }
  }

  async write(sessionId: string, content: string): Promise<void> {
    const file = this.fileOf(sessionId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf-8');
  }

  async clear(sessionId: string): Promise<void> {
    await fs.rm(this.fileOf(sessionId), { force: true });
  }
}

function renderTranscript(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => {
      const speaker = message.role === 'user' ? '用户' : '助手';
      const text = message.content.trim();
      return text ? `${speaker}：${text}` : '';
    })
    .filter(Boolean)
    .join('\n')
    .slice(-6000);
}

export interface MemoryManagerOptions {
  store: MemoryStore;
  llm: LlmClient;
  /** 每多少轮对话尝试更新一次记忆 */
  updateInterval?: number;
  maxLength?: number;
}

/**
 * 记忆管理器
 *
 * 更新是「尽力而为」的旁路任务：失败只记日志，绝不影响主对话链路。
 */
export class MemoryManager {
  private readonly store: MemoryStore;
  private readonly llm: LlmClient;
  private readonly updateInterval: number;
  private readonly maxLength: number;
  /** 防止同一会话并发抽取 */
  private readonly inFlight = new Set<string>();

  constructor(options: MemoryManagerOptions) {
    this.store = options.store;
    this.llm = options.llm;
    this.updateInterval = options.updateInterval ?? env.memory.updateInterval;
    this.maxLength = options.maxLength ?? env.memory.maxLength;
  }

  read(sessionId: string): Promise<string> {
    return this.store.read(sessionId);
  }

  clear(sessionId: string): Promise<void> {
    return this.store.clear(sessionId);
  }

  shouldUpdate(turnCount: number): boolean {
    return turnCount > 0 && turnCount % this.updateInterval === 0;
  }

  /** 抽取并合并记忆。调用方无需 await，失败静默降级。 */
  async update(sessionId: string, history: ChatMessage[]): Promise<void> {
    if (this.inFlight.has(sessionId)) return;
    this.inFlight.add(sessionId);

    try {
      const transcript = renderTranscript(history);
      if (!transcript) return;

      const existing = await this.store.read(sessionId);
      const prompt = buildMemoryExtractionPrompt(existing, transcript, this.maxLength);
      const extracted = (await this.llm.complete(prompt, { temperature: 0.2 })).trim();

      if (!extracted || extracted.toUpperCase() === 'NONE') return;

      await this.store.write(sessionId, extracted.slice(0, this.maxLength));
      log.debug('记忆已更新', { sessionId, length: extracted.length });
    } catch (error) {
      log.warn('记忆更新失败', { sessionId, error });
    } finally {
      this.inFlight.delete(sessionId);
    }
  }
}
