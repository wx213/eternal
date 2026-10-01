/**
 * 进程入口：启动、健康提示、优雅关闭
 */
import fs from 'node:fs';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/index.js';
import { getRuntimePool } from './runtime/pool.js';
import { createLogger } from './shared/logger.js';

const log = createLogger('server');

fs.mkdirSync(env.paths.dataDir, { recursive: true });

const app = createApp();
const server = app.listen(env.http.port, env.http.host, () => {
  log.info('服务已启动', {
    url: `http://${env.http.host}:${env.http.port}`,
    env: env.nodeEnv,
    cors: env.http.corsOrigins,
    llmProvider: env.llm.provider,
  });

  if (!env.llm.apiKey) {
    log.warn('未配置 LLM_API_KEY，对话与知识库功能不可用（请在 server/.env 填入）');
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    log.error('端口被占用', { port: env.http.port });
  } else {
    log.error('启动失败', { error });
  }
  process.exit(1);
});

// SSE 是长连接，给足关闭时间但不无限等待
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('开始优雅关闭', { signal });

  // 先中止所有在途对话，让 SSE 连接尽快结束，否则 server.close 会一直等
  getRuntimePool().shutdown();

  const forceExit = setTimeout(() => {
    log.warn('关闭超时，强制退出');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();

  log.info('已完成关闭');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log.error('未处理的 Promise 拒绝', { reason });
});
process.on('uncaughtException', (error) => {
  log.error('未捕获异常', { error });
  void shutdown('uncaughtException');
});
