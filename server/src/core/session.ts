/**
 * 会话状态与生命周期
 *
 * 一个 Session = 一条会话的内存上下文（消息历史 + 串行队列 + 熔断器 + 进行中的请求）。
 * 落库的消息由 conversations 模块负责；这里只维护「喂给模型的上下文」。
 */
import { CircuitBreaker, SerialQueue } from './resilience.js';
import type { ChatMessage } from './types.js';

/** 一次进行中的对话请求，用于支持中止 */
export interface RequestHandle {
  readonly id: string;
  readonly controller: AbortController;
  aborted: boolean;
  abortReason?: string;
}

export class Session {
  readonly id: string;
  /** 不含系统消息的对话历史 */
  history: ChatMessage[] = [];
  /** 已完成的用户轮次数，用于触发记忆更新 */
  turnCount = 0;
  /** 摘要策略下累积的历史摘要 */
  summary = '';
  lastActiveAt = Date.now();

  readonly queue = new SerialQueue();
  readonly llmBreaker = new CircuitBreaker(4, 20_000);
  readonly toolBreaker = new CircuitBreaker(4, 10_000);

  private seq = 0;
  private readonly requests = new Map<string, RequestHandle>();

  constructor(id: string) {
    this.id = id;
  }

  touch(): void {
    this.lastActiveAt = Date.now();
  }

  beginRequest(): RequestHandle {
    this.seq += 1;
    const handle: RequestHandle = {
      id: `${this.id}#${this.seq}`,
      controller: new AbortController(),
      aborted: false,
    };
    this.requests.set(handle.id, handle);
    return handle;
  }

  endRequest(requestId: string): void {
    this.requests.delete(requestId);
  }

  /** 中止指定请求；不传则中止该会话所有进行中的请求 */
  abort(reason = 'client.abort', requestId?: string): boolean {
    const targets = requestId
      ? [this.requests.get(requestId)].filter((item): item is RequestHandle => Boolean(item))
      : [...this.requests.values()];

    let hit = false;
    for (const handle of targets) {
      if (handle.aborted) continue;
      handle.aborted = true;
      handle.abortReason = reason;
      handle.controller.abort(reason);
      hit = true;
    }
    return hit;
  }

  get activeRequestCount(): number {
    return this.requests.size;
  }

  reset(): void {
    this.history = [];
    this.turnCount = 0;
    this.summary = '';
  }
}

export interface SessionStoreOptions {
  ttlMs: number;
  maxSessions: number;
}

/** 会话池：TTL 过期回收 + 超量按最近活跃淘汰 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: SessionStoreOptions) {}

  get(sessionId: string): Session {
    this.evictExpired();

    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.touch();
      return existing;
    }

    const session = new Session(sessionId);
    this.sessions.set(sessionId, session);
    this.evictOverflow();
    return session;
  }

  peek(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  drop(sessionId: string): void {
    this.sessions.get(sessionId)?.abort('session.drop');
    this.sessions.delete(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  /** 关停时中止所有在途请求 */
  abortAll(reason = 'server.shutdown'): void {
    for (const session of this.sessions.values()) session.abort(reason);
  }

  private evictExpired(): void {
    const deadline = Date.now() - this.options.ttlMs;
    for (const [id, session] of this.sessions) {
      // 有在途请求的会话不回收，避免抽掉正在使用的上下文
      if (session.lastActiveAt < deadline && session.activeRequestCount === 0) {
        this.sessions.delete(id);
      }
    }
  }

  private evictOverflow(): void {
    if (this.sessions.size <= this.options.maxSessions) return;

    const candidates = [...this.sessions.entries()]
      .filter(([, session]) => session.activeRequestCount === 0)
      .sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);

    const overflow = this.sessions.size - this.options.maxSessions;
    for (let i = 0; i < overflow && i < candidates.length; i += 1) {
      this.sessions.delete(candidates[i]![0]);
    }
  }
}
