/**
 * 环境变量解析与校验（唯一读取 process.env 的地方）
 *
 * 安全约定：
 * - 所有密钥仅从环境变量读取，不落库、不回显、不进日志
 * - 生产环境（NODE_ENV=production）缺失或使用弱密钥直接启动失败，避免带着默认密钥上线
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const WEAK_SECRETS = new Set(['dev_access_secret', 'dev_refresh_secret', 'change_me', 'secret']);

/** 允许空字符串的可选字符串（.env 里留空等同未配置） */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

/** 逗号分隔列表 */
const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const intFrom = (fallback: number, min = 1) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
    });

const floatFrom = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
    });

const boolFrom = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PORT: intFrom(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: csv,
  TRUST_PROXY: boolFrom(false),

  JWT_ACCESS_SECRET: optionalString,
  JWT_REFRESH_SECRET: optionalString,
  ACCESS_TOKEN_TTL: intFrom(60 * 60 * 2),
  REFRESH_TOKEN_TTL: intFrom(60 * 60 * 24 * 14),

  DB_PATH: z.string().default('./data/agentchat.db'),
  DATA_DIR: z.string().default('./data'),

  LLM_PROVIDER: z.string().default('siliconflow'),
  LLM_BASE_URL: optionalString,
  LLM_API_KEY: optionalString,
  SILICONFLOW_API_KEY: optionalString,
  DASHSCOPE_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  LLM_CHAT_MODEL: optionalString,
  LLM_FAST_MODEL: optionalString,
  LLM_EMBED_MODEL: optionalString,
  LLM_TIMEOUT_MS: intFrom(120_000),

  RUNTIME_MAX_AGENTS: intFrom(50),
  RUNTIME_TTL_MS: intFrom(30 * 60 * 1000),
  SESSION_TTL_MS: intFrom(60 * 60 * 1000),
  MAX_SESSIONS_PER_AGENT: intFrom(200),

  AGENT_MAX_ITERATIONS: intFrom(12),
  AGENT_MAX_HISTORY: intFrom(24),
  AGENT_TEMPERATURE: floatFrom(0.7, 0, 2),

  MEMORY_ENABLED: boolFrom(true),
  MEMORY_UPDATE_INTERVAL: intFrom(6),
  MEMORY_MAX_LENGTH: intFrom(1200),

  RAG_TOP_K: intFrom(4),
  RAG_MIN_SCORE: floatFrom(0.25, 0, 1),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  /** 是否允许工具访问内网地址（默认禁止，防 SSRF） */
  ALLOW_INTERNAL_NETWORK: boolFrom(false),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`环境变量校验失败：\n${detail}`);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';

const apiKey = raw.LLM_API_KEY ?? raw.SILICONFLOW_API_KEY ?? raw.DASHSCOPE_API_KEY ?? raw.OPENAI_API_KEY;

const resolveDir = (target: string) => (path.isAbsolute(target) ? target : path.resolve(process.cwd(), target));

const dataDir = resolveDir(raw.DATA_DIR);

/**
 * 开发环境密钥兜底。
 *
 * 未配置时生成强随机密钥并持久化到 data/.dev-secrets.json（不入库、不进仓库），
 * 这样热重载重启后登录态仍有效，同时本地也不会退化成写死的弱密钥。
 * 生产环境不走这条路径，必须显式配置。
 */
function loadDevSecrets(): { access: string; refresh: string } {
  const file = path.join(dataDir, '.dev-secrets.json');

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { access?: string; refresh?: string };
    if (parsed.access && parsed.refresh) return { access: parsed.access, refresh: parsed.refresh };
  } catch {
    // 文件不存在或损坏时重新生成
  }

  const secrets = {
    access: randomBytes(48).toString('base64url'),
    refresh: randomBytes(48).toString('base64url'),
  };

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(secrets), { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // 写盘失败也能继续（退化为本次进程内有效）
  }
  return secrets;
}

let devSecrets: { access: string; refresh: string } | null = null;

function resolveSecret(name: string, value: string | undefined, kind: 'access' | 'refresh'): string {
  const invalid = !value || value.length < 32 || WEAK_SECRETS.has(value);
  if (!invalid) return value!;

  if (isProduction) {
    throw new Error(`${name} 未配置或强度不足（生产环境要求长度 >= 32 的随机值）`);
  }

  devSecrets ??= loadDevSecrets();
  return devSecrets[kind];
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isTest: raw.NODE_ENV === 'test',

  http: {
    port: raw.PORT,
    host: raw.HOST,
    corsOrigins: raw.CORS_ORIGIN.length > 0 ? raw.CORS_ORIGIN : ['http://localhost:5173'],
    trustProxy: raw.TRUST_PROXY,
  },

  jwt: {
    accessSecret: resolveSecret('JWT_ACCESS_SECRET', raw.JWT_ACCESS_SECRET, 'access'),
    refreshSecret: resolveSecret('JWT_REFRESH_SECRET', raw.JWT_REFRESH_SECRET, 'refresh'),
    accessTtlSec: raw.ACCESS_TOKEN_TTL,
    refreshTtlSec: raw.REFRESH_TOKEN_TTL,
  },

  paths: {
    dataDir,
    dbFile: resolveDir(raw.DB_PATH),
  },

  llm: {
    provider: raw.LLM_PROVIDER.toLowerCase(),
    baseUrl: raw.LLM_BASE_URL,
    apiKey,
    chatModel: raw.LLM_CHAT_MODEL,
    fastModel: raw.LLM_FAST_MODEL,
    embedModel: raw.LLM_EMBED_MODEL,
    timeoutMs: raw.LLM_TIMEOUT_MS,
  },

  runtime: {
    maxAgents: raw.RUNTIME_MAX_AGENTS,
    agentTtlMs: raw.RUNTIME_TTL_MS,
    sessionTtlMs: raw.SESSION_TTL_MS,
    maxSessionsPerAgent: raw.MAX_SESSIONS_PER_AGENT,
  },

  agent: {
    maxIterations: raw.AGENT_MAX_ITERATIONS,
    maxHistoryMessages: raw.AGENT_MAX_HISTORY,
    defaultTemperature: raw.AGENT_TEMPERATURE,
  },

  memory: {
    enabled: raw.MEMORY_ENABLED,
    updateInterval: raw.MEMORY_UPDATE_INTERVAL,
    maxLength: raw.MEMORY_MAX_LENGTH,
  },

  rag: {
    topK: raw.RAG_TOP_K,
    minScore: raw.RAG_MIN_SCORE,
  },

  logLevel: raw.LOG_LEVEL,
  allowInternalNetwork: raw.ALLOW_INTERNAL_NETWORK,
} as const;

export type Env = typeof env;
