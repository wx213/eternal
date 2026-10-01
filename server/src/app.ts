/**
 * Express 应用组装
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { AppError } from './shared/errors.js';
import { errorHandler, notFoundHandler } from './http/middleware/error.js';
import { authRouter } from './modules/auth/routes.js';
import { agentsRouter } from './modules/agents/routes.js';
import { conversationsRouter } from './modules/conversations/routes.js';
import { getRuntimePool } from './runtime/pool.js';

export function createApp() {
  const app = express();

  // 反向代理后需信任 X-Forwarded-* 才能拿到真实 IP（限流依赖它）
  if (env.http.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // 纯 JSON API，不需要 CSP；前端由 Vite/静态服务单独承载
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // 无 origin：同源请求、curl、服务端调用
        if (!origin || env.http.corsOrigins.includes('*') || env.http.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(AppError.forbidden(`CORS 不允许的来源：${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // 全局兜底限流，防单 IP 打满
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'agentchat-api',
      env: env.nodeEnv,
      runtimeAgents: getRuntimePool().size,
      llmConfigured: Boolean(env.llm.apiKey),
    });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/agents', agentsRouter);
  app.use('/api/v1/conversations', conversationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
