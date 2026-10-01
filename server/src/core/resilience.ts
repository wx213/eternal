/**
 * 韧性原语：超时、重试、熔断、串行锁
 *
 * 相比原内核的实现，这里的关键修正：
 * - withTimeout 会主动 abort 底层任务，而不是只让 Promise.race 先返回（否则请求仍在后台跑）
 * - retry 默认不重试「中止」与「参数错误」这类不可恢复失败
 */
import { AbortError, isAbortError } from '../shared/errors.js';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError('sleep'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new AbortError('sleep'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 给一个可中止任务加上超时。
 * task 收到的 signal 会在超时时被 abort，确保底层请求真正结束。
 */
export async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return task(parentSignal ?? new AbortController().signal);
  }

  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) throw new AbortError(label);
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await task(controller.signal);
  } catch (error) {
    if (timedOut) throw new Error(`${label} 超时（${timeoutMs}ms）`);
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
}

/** 默认策略：中止不重试，其余重试 */
function defaultShouldRetry(error: unknown): boolean {
  return !isAbortError(error);
}

export async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 2,
    baseDelayMs = 300,
    maxDelayMs = 8_000,
    factor = 2,
    signal,
    shouldRetry = defaultShouldRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw new AbortError('retry');
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) break;
      await sleep(Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs), signal);
    }
  }

  throw lastError;
}

type BreakerState = 'closed' | 'open' | 'half_open';

/** 熔断器：连续失败达到阈值后短路，冷却后放行一次探测请求 */
export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private nextTryAt = 0;

  constructor(
    private readonly failureThreshold = 4,
    private readonly cooldownMs = 15_000,
  ) {}

  canRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() >= this.nextTryAt) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.nextTryAt = Date.now() + this.cooldownMs;
    }
  }

  get currentState(): BreakerState {
    return this.state;
  }
}

/** 串行执行器：保证同一会话的消息处理不并发，避免上下文交错 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
