/**
 * Agent 内核：ReAct 主循环
 *
 * 相对原 ProductionAgent 的关键修正：
 * 1. 无全局可变状态。LLM、检索器、记忆全部由构造注入，多 Agent 并存不会互相覆盖
 *    （原内核的 setScriptGeneratorLLM(llm) 是进程级单例，后创建的 Agent 会覆盖先创建的）。
 * 2. 工具默认不重试。工具可能有副作用（发信、写文件），无条件重试会造成重复执行；
 *    只有工具显式声明 retryable 才重试。
 * 3. 达到迭代上限时不再抛错，而是撤掉工具让模型收尾，用户能拿到有效回答。
 * 4. 工具参数校验失败会把具体错误回喂给模型自我纠正，而不是直接返回一句失败文案。
 */
import { z } from 'zod';
import { env } from '../config/env.js';
import { AbortError, isAbortError, toErrorMessage } from '../shared/errors.js';
import { createLogger, type Logger } from '../shared/logger.js';
import { manageContext, stripEphemeralSystemMessages } from './context.js';
import { zodToJsonSchema } from './jsonSchema.js';
import type { MemoryManager } from './memory.js';
import { buildKnowledgeBlock, buildMemoryBlock, buildSystemPrompt } from './prompt.js';
import { retry, withTimeout } from './resilience.js';
import { Session, SessionStore, type RequestHandle } from './session.js';
import type {
  AgentConfig,
  AgentEvent,
  ChatMessage,
  ChatRequestOptions,
  ChatResult,
  KnowledgeRetriever,
  LlmClient,
  LlmToolSchema,
  ToolContext,
  ToolDefinition,
  ToolOutcome,
  ToolTraceEntry,
} from './types.js';

const TOOL_TIMEOUT_MS = 90_000;
const BUSY_MESSAGE = '模型服务暂时不可用，请稍后再试。';
/** 同一轮内允许的重复工具调用次数，超过则强制收尾，防止模型陷入循环 */
const MAX_DUPLICATE_CALLS = 2;

export interface AgentDeps {
  llm: LlmClient;
  retriever: KnowledgeRetriever | null;
  memory: MemoryManager | null;
}

export class Agent {
  private readonly log: Logger;
  private readonly systemPrompt: string;
  private readonly toolMap: Map<string, ToolDefinition>;
  private readonly toolSchemas: LlmToolSchema[];
  private readonly sessions: SessionStore;

  constructor(
    private readonly config: AgentConfig,
    private readonly deps: AgentDeps,
  ) {
    this.log = createLogger(`agent:${config.agentId}`);
    this.systemPrompt = buildSystemPrompt(config);
    this.toolMap = new Map(config.tools.map((tool) => [tool.name, tool]));
    this.toolSchemas = config.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    }));
    this.sessions = new SessionStore({
      ttlMs: env.runtime.sessionTtlMs,
      maxSessions: env.runtime.maxSessionsPerAgent,
    });
  }

  /** 中止某会话进行中的请求 */
  abort(sessionId: string, reason = 'client.abort'): boolean {
    return this.sessions.peek(sessionId)?.abort(reason) ?? false;
  }

  /** 用已落库的历史消息预热内存上下文（进程重启或会话被回收后仍能延续对话） */
  hydrate(sessionId: string, history: ChatMessage[]): void {
    const session = this.sessions.get(sessionId);
    if (session.history.length > 0) return;
    session.history = [...history];
    session.turnCount = history.filter((message) => message.role === 'user').length;
  }

  resetSession(sessionId: string): void {
    this.sessions.peek(sessionId)?.reset();
  }

  shutdown(): void {
    this.sessions.abortAll();
  }

  /** 对话入口。同一会话的请求会串行执行，避免上下文交错。 */
  async chat(options: ChatRequestOptions): Promise<ChatResult> {
    const session = this.sessions.get(options.sessionId);
    return session.queue.run(() => this.runTurn(session, options));
  }

  private async runTurn(session: Session, options: ChatRequestOptions): Promise<ChatResult> {
    const handle = session.beginRequest();
    // 客户端断开与主动中止两路信号合并，任一触发都终止整轮
    const signal = AbortSignal.any([options.signal, handle.controller.signal]);
    const trace: ToolTraceEntry[] = [];
    /** 本轮工具调用结果缓存，用于识别并短路重复调用 */
    const callCache = new Map<string, ToolOutcome>();
    let duplicateCalls = 0;
    let answer = '';
    let iterations = 0;

    session.touch();

    try {
      await this.prepareTurn(session, options, signal);

      const memoryBlock = await this.loadMemoryBlock(options.sessionId);

      while (iterations < this.config.maxIterations) {
        iterations += 1;
        this.throwIfAborted(signal);

        // 撤掉工具强制收尾的两种情形：迭代耗尽，或模型已在原地重复调用
        const isFinalRound = iterations === this.config.maxIterations || duplicateCalls >= MAX_DUPLICATE_CALLS;
        const completion = await this.callModel(session, memoryBlock, {
            allowTools: !isFinalRound,
            signal,
            onEvent: options.onEvent,
          });

        if (completion === null) {
          // 熔断打开：直接给出降级提示
          options.onEvent({ type: 'error', code: 'UPSTREAM_ERROR', message: BUSY_MESSAGE });
          answer = BUSY_MESSAGE;
          break;
        }

        const validCalls = completion.toolCalls.filter((call) => call.name);

        if (validCalls.length === 0) {
          answer = completion.text.trim();
          session.history.push({ role: 'assistant', content: answer });
          break;
        }

        session.history.push({
          role: 'assistant',
          content: completion.text,
          toolCalls: validCalls,
        });

        for (const call of validCalls) {
          this.throwIfAborted(signal);

          const definition = this.toolMap.get(call.name);
          const label = definition?.label ?? call.name;

          options.onEvent({ type: 'tool.start', id: call.id, name: call.name, label });

          // 相同工具 + 相同参数视为重复调用：直接复用结果，避免重复执行副作用与空转
          const cacheKey = `${call.name}:${stableStringify(call.args)}`;
          const cached = callCache.get(cacheKey);
          const isDuplicate = cached !== undefined;

          let outcome: ToolOutcome;
          let durationMs = 0;

          if (cached) {
            duplicateCalls += 1;
            outcome = cached;
            this.log.debug('命中重复工具调用', { tool: call.name, duplicateCalls });
          } else {
            const startedAt = Date.now();
            outcome = await this.executeTool(session, definition, call.args, call.rawArgs, {
              ownerId: this.config.ownerId,
              agentId: this.config.agentId,
              sessionId: options.sessionId,
              signal,
            });
            durationMs = Date.now() - startedAt;
            callCache.set(cacheKey, outcome);
          }

          const summary = summarizeOutcome(outcome);
          options.onEvent({
            type: 'tool.end',
            id: call.id,
            name: call.name,
            label,
            ok: outcome.ok,
            durationMs,
            summary,
          });
          trace.push({ id: call.id, name: call.name, label, ok: outcome.ok, durationMs, summary });

          session.history.push({
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: isDuplicate
              ? `【注意】这次调用的工具与参数和之前完全相同，结果不会变化。请直接基于下面的结果回答用户，不要再次调用任何工具。\n${renderOutcomeForModel(outcome)}`
              : renderOutcomeForModel(outcome),
          });
        }
      }

      // 迭代耗尽且模型始终在调工具时的兜底
      if (!answer) {
        answer = '我调用了多次工具但还没能得出结论，可以补充一些信息或把问题拆小一点吗？';
        session.history.push({ role: 'assistant', content: answer });
      }

      session.turnCount += 1;
      options.onEvent({ type: 'done', text: answer, trace, iterations });

      this.scheduleMemoryUpdate(session, options.sessionId);

      return { text: answer, trace, iterations, aborted: false };
    } catch (error) {
      if (isAbortError(error)) {
        this.log.debug('请求已中止', { sessionId: options.sessionId, reason: handle.abortReason });
        return { text: answer, trace, iterations, aborted: true };
      }

      const message = toErrorMessage(error);
      this.log.error('对话执行失败', { sessionId: options.sessionId, error });
      options.onEvent({ type: 'error', code: 'INTERNAL_ERROR', message });
      return { text: '', trace, iterations, aborted: false };
    } finally {
      session.endRequest(handle.id);
    }
  }

  /** 写入用户消息、预检索知识、压缩上下文 */
  private async prepareTurn(session: Session, options: ChatRequestOptions, signal: AbortSignal): Promise<void> {
    // 上一轮注入的知识块只对当轮有效
    session.history = stripEphemeralSystemMessages(session.history);
    session.history.push({ role: 'user', content: options.message });

    const knowledgeBlock = await this.prefetchKnowledge(options.message, signal);
    if (knowledgeBlock) {
      session.history.push({ role: 'system', content: knowledgeBlock, kind: 'knowledge' });
    }

    const managed = await manageContext({
      systemMessages: [],
      history: session.history,
      strategy: this.config.contextStrategy,
      maxHistoryMessages: this.config.maxHistoryMessages,
      llm: this.deps.llm,
      signal,
    });
    session.history = managed.history;
    if (managed.summary) session.summary = managed.summary;
  }

  private async prefetchKnowledge(message: string, signal: AbortSignal): Promise<string | null> {
    if (!this.config.knowledgePrefetch || !this.deps.retriever) return null;
    // 过短的输入（"好"、"?"）检索意义不大，反而干扰
    if (message.replace(/[\s\p{P}\p{S}]/gu, '').length < 4) return null;

    try {
      const hits = await this.deps.retriever.retrieve(message, env.rag.topK);
      if (hits.length === 0) return null;
      this.throwIfAborted(signal);
      return buildKnowledgeBlock(hits);
    } catch (error) {
      if (isAbortError(error)) throw error;
      this.log.warn('知识预检索失败', { error });
      return null;
    }
  }

  private async loadMemoryBlock(sessionId: string): Promise<string | null> {
    if (!this.config.memoryEnabled || !this.deps.memory) return null;
    const memory = await this.deps.memory.read(sessionId);
    return memory.trim() ? buildMemoryBlock(memory) : null;
  }

  /** 调用模型。熔断打开时返回 null 由调用方降级。 */
  private async callModel(
    session: Session,
    memoryBlock: string | null,
    options: { allowTools: boolean; signal: AbortSignal; onEvent: (event: AgentEvent) => void },
  ) {
    if (!session.llmBreaker.canRequest()) {
      this.log.warn('LLM 熔断中，跳过本次调用');
      return null;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt, kind: 'base' },
      ...(memoryBlock ? [{ role: 'system' as const, content: memoryBlock, kind: 'memory' as const }] : []),
      ...session.history,
    ];

    try {
      const completion = await retry(
        () =>
          withTimeout(
            (signal) =>
              this.deps.llm.chat({
                messages,
                ...(options.allowTools && this.toolSchemas.length > 0 ? { tools: this.toolSchemas } : {}),
                temperature: this.config.temperature,
                ...(this.config.model ? { model: this.config.model } : {}),
                signal,
                onChunk: (chunk) => {
                  if (chunk.text) options.onEvent({ type: 'delta', text: chunk.text });
                  if (chunk.reasoning) options.onEvent({ type: 'reasoning', text: chunk.reasoning });
                },
              }),
            env.llm.timeoutMs,
            '模型调用',
            options.signal,
          ),
        { attempts: 2, baseDelayMs: 500, signal: options.signal },
      );

      session.llmBreaker.recordSuccess();
      return completion;
    } catch (error) {
      if (isAbortError(error)) throw error;
      session.llmBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * 执行单个工具：定位 -> 校验参数 -> 熔断/超时保护 -> 执行。
   * 任何失败都转成结构化 outcome，交由模型自我纠正，不中断整轮。
   */
  private async executeTool(
    session: Session,
    definition: ToolDefinition | undefined,
    args: Record<string, unknown> | null,
    rawArgs: string,
    scope: { ownerId: string; agentId: string; sessionId: string; signal: AbortSignal },
  ): Promise<ToolOutcome> {
    if (!definition) {
      return { ok: false, error: `工具不存在。请只使用系统列出的工具：${[...this.toolMap.keys()].join('、') || '（无）'}` };
    }

    if (args === null) {
      return {
        ok: false,
        error: `参数不是合法的 JSON 对象，收到：${rawArgs.slice(0, 200)}。请重新以 JSON 对象形式提供参数。`,
      };
    }

    const parsed = definition.schema.safeParse(args);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(根)'}: ${issue.message}`)
        .join('；');
      return { ok: false, error: `参数校验失败（${detail}）。请按参数说明修正后重试。` };
    }

    if (!session.toolBreaker.canRequest()) {
      return { ok: false, error: '工具连续失败已被临时熔断，请稍后再试或改用其它方式。' };
    }

    const context: ToolContext = {
      ownerId: scope.ownerId,
      agentId: scope.agentId,
      sessionId: scope.sessionId,
      signal: scope.signal,
      logger: this.log.child(definition.name),
      retriever: this.deps.retriever,
      llm: this.deps.llm,
    };

    try {
      const outcome = await withTimeout(
        (signal) => definition.execute(parsed.data, { ...context, signal }),
        TOOL_TIMEOUT_MS,
        `工具 ${definition.name}`,
        scope.signal,
      );

      // 仅在工具显式声明可安全重试时才重试，避免重复触发副作用
      if (!outcome.ok && outcome.retryable) {
        const retried = await retry(
          () =>
            withTimeout(
              (signal) => definition.execute(parsed.data, { ...context, signal }),
              TOOL_TIMEOUT_MS,
              `工具 ${definition.name}`,
              scope.signal,
            ),
          { attempts: 2, baseDelayMs: 400, signal: scope.signal },
        ).catch(() => outcome);

        if (retried.ok) session.toolBreaker.recordSuccess();
        else session.toolBreaker.recordFailure();
        return retried;
      }

      if (outcome.ok) session.toolBreaker.recordSuccess();
      else session.toolBreaker.recordFailure();
      return outcome;
    } catch (error) {
      if (isAbortError(error)) throw error;
      session.toolBreaker.recordFailure();
      this.log.warn('工具执行异常', { tool: definition.name, error });
      return { ok: false, error: `工具执行异常：${toErrorMessage(error)}` };
    }
  }

  private scheduleMemoryUpdate(session: Session, sessionId: string): void {
    const memory = this.deps.memory;
    if (!this.config.memoryEnabled || !memory) return;
    if (!memory.shouldUpdate(session.turnCount)) return;

    // 旁路任务：不阻塞响应返回
    void memory.update(sessionId, session.history);
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new AbortError(String(signal.reason ?? 'aborted'));
  }
}

/**
 * 参数的稳定序列化：键排序后再输出，保证 {a:1,b:2} 与 {b:2,a:1} 得到同一个缓存键。
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

  return `{${entries.join(',')}}`;
}

/** 工具结果的一句话摘要，用于前端过程可视化 */
function summarizeOutcome(outcome: ToolOutcome): string {
  if (!outcome.ok) return outcome.error.slice(0, 200);
  if (outcome.summary) return outcome.summary.slice(0, 200);

  const data = outcome.data;
  if (typeof data === 'string') return data.slice(0, 200);
  if (Array.isArray(data)) return `返回 ${data.length} 条结果`;
  return '执行成功';
}

/** 工具结果序列化给模型看。保持紧凑，避免长 JSON 冲掉上下文。 */
function renderOutcomeForModel(outcome: ToolOutcome): string {
  if (!outcome.ok) return `执行失败：${outcome.error}`;

  const data = outcome.data;
  if (typeof data === 'string') return data.slice(0, 8000);
  try {
    return JSON.stringify(data).slice(0, 8000);
  } catch {
    return String(data);
  }
}

/** 工具定义辅助函数，保留 schema 的类型推断 */
export function defineTool<S extends z.ZodTypeAny>(definition: ToolDefinition<S>): ToolDefinition {
  return definition as unknown as ToolDefinition;
}
