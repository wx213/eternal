/**
 * 轻量结构化日志
 *
 * 生产输出单行 JSON（便于采集），开发输出可读文本。
 * 内置敏感字段脱敏，避免 apiKey / token / password 进日志。
 */
import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const threshold = LEVEL_WEIGHT[env.logLevel];

const SENSITIVE_KEY = /(password|passwd|secret|token|apikey|api_key|authorization|cookie)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

function write(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const safeMeta = meta ? (redact(meta) as Record<string, unknown>) : undefined;

  if (env.isProduction) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      ...(safeMeta ? { meta: safeMeta } : {}),
    });
    process.stdout.write(`${line}\n`);
    return;
  }

  const icon = { debug: '·', info: 'i', warn: '!', error: 'x' }[level];
  const tail = safeMeta && Object.keys(safeMeta).length > 0 ? ` ${JSON.stringify(safeMeta)}` : '';
  const target = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  target.write(`[${icon}] [${scope}] ${message}${tail}\n`);
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(childScope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, meta) => write('debug', scope, message, meta),
    info: (message, meta) => write('info', scope, message, meta),
    warn: (message, meta) => write('warn', scope, message, meta),
    error: (message, meta) => write('error', scope, message, meta),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

export const logger = createLogger('app');
