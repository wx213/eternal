/**
 * 认证服务
 *
 * 安全要点：
 * - 口令用 argon2id 哈希（内存硬化，抗 GPU 爆破）
 * - 登录失败统一文案，且用户不存在时也走一次哈希校验，消除时序侧信道
 * - 邮箱统一小写归一，避免同一邮箱注册出多个账号
 */
import argon2 from 'argon2';
import { AppError } from '../../shared/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../http/middleware/auth.js';
import * as repo from './repo.js';
import type { PublicUser } from './repo.js';

/** 用户不存在时用来做等时校验的假哈希（对应口令永不可能匹配） */
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyYmF6cXV1eGZvb2JhcmJhemE';

const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function issue(row: repo.UserRow): AuthResult {
  const user = { id: row.id, email: row.email };
  return {
    user: repo.toPublicUser(row),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function register(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);

  if (repo.findByEmail(email)) {
    throw AppError.conflict('该邮箱已注册');
  }

  const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);
  const displayName = input.displayName?.trim() || email.split('@')[0]!;
  const row = repo.createUser({ email, passwordHash, displayName });

  return issue(row);
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const row = repo.findByEmail(email);

  // 无论用户是否存在都执行一次 verify，保证响应耗时一致
  const hash = row?.password_hash ?? DUMMY_HASH;
  const matched = await argon2.verify(hash, input.password).catch(() => false);

  if (!row || !matched) {
    throw AppError.unauthorized('邮箱或密码错误');
  }
  if (row.status !== 'active') {
    throw AppError.forbidden('账号已被停用');
  }

  return issue(row);
}

export function refresh(refreshToken: string): AuthResult {
  const decoded = verifyRefreshToken(refreshToken);
  const row = repo.findById(decoded.id);

  if (!row || row.status !== 'active') {
    throw AppError.unauthorized('账号不可用，请重新登录');
  }
  return issue(row);
}

export function getProfile(userId: string): PublicUser {
  const row = repo.findById(userId);
  if (!row) throw AppError.unauthorized('账号不存在');
  return repo.toPublicUser(row);
}
