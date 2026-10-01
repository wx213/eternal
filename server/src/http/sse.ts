/**
 * SSE 通道
 *
 * 职责收敛：控制器不再手写 res.write(`data: ...`)，也不再各自处理心跳与断开。
 * 事件体就是内核的 AgentEvent，前后端共用同一套语义，去掉了中间那层 delta/tool 的二次翻译。
 */
import type { Response } from 'express';
import type { AgentEvent } from '../core/types.js';

/** 心跳间隔：低于常见网关 60s 空闲超时，防止长思考期间连接被掐断 */
const HEARTBEAT_MS = 20_000;

export class SseChannel {
  private closed = false;
  private readonly heartbeat: NodeJS.Timeout;

  constructor(private readonly res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // 禁用 Nginx 缓冲，否则流式会被攒成一整块下发
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.heartbeat = setInterval(() => this.comment('ping'), HEARTBEAT_MS);
  }

  get isClosed(): boolean {
    return this.closed || this.res.writableEnded;
  }

  send(event: AgentEvent): void {
    this.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /** 注释帧：用于心跳，客户端会忽略 */
  private comment(text: string): void {
    this.write(`: ${text}\n\n`);
  }

  private write(payload: string): void {
    if (this.isClosed) return;
    try {
      this.res.write(payload);
    } catch {
      this.closed = true;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    if (!this.res.writableEnded) this.res.end();
  }
}
