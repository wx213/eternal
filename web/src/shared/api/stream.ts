/**
 * SSE 流式对话
 *
 * 事件体直接就是后端的 AgentEvent，前端不再做「delta -> content」这类二次翻译。
 * 解析上修正了原实现的两个问题：
 * 1. 只认单行 data:，多行 data 字段会被丢弃 —— 现在按 SSE 规范拼接多行
 * 2. 注释帧（心跳 `: ping`）会进入 JSON.parse —— 现在显式跳过
 */
import { ApiError, authHeader } from './client';
import type { AgentEvent, ApiErrorBody } from '../types';

const BASE = '/api/v1';

export interface StreamOptions {
  conversationId: string;
  message: string;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

/** 解析一个 SSE 事件块，返回 data 字段拼接结果 */
function parseEventBlock(block: string): string | null {
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    // 注释帧（心跳）
    if (line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}

export async function streamChat(options: StreamOptions): Promise<void> {
  const response = await fetch(`${BASE}/conversations/${options.conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ message: options.message }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // 忽略解析失败
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'STREAM_FAILED',
      body?.error?.message ?? '发送失败，请稍后重试',
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 以空行分隔事件块
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const payload = parseEventBlock(block);
        if (!payload) continue;
        try {
          options.onEvent(JSON.parse(payload) as AgentEvent);
        } catch {
          // 单个事件损坏不应中断整个流
        }
      }
    }
  } finally {
    // 提前 return / 抛错时释放底层连接
    reader.cancel().catch(() => undefined);
  }
}
