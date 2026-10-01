/**
 * JWT 鉴权
 */
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  email: string;
  typ: 'access' | 'refresh';
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, typ: 'access' } satisfies TokenPayload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtlSec,
  });
}

export function signRefreshToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, typ: 'refresh' } satisfies TokenPayload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtlSec,
  });
}

function verify(token: string, secret: string, expected: 'access' | 'refresh'): TokenPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    throw new AppError(expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED', expired ? '登录已过期，请重新登录' : '凭证无效');
  }

  const payload = decoded as TokenPayload;
  // 类型校验：防止把 refresh token 当 access token 使用
  if (!payload?.sub || payload.typ !== expected) {
    throw AppError.unauthorized('凭证类型不匹配');
  }
  return payload;
}

export function verifyRefreshToken(token: string): AuthUser {
  const payload = verify(token, env.jwt.refreshSecret, 'refresh');
  return { id: payload.sub, email: payload.email };
}

/** 从 Authorization: Bearer 解析 access token */
export function authRequired(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    next(AppError.unauthorized('未提供访问令牌'));
    return;
  }

  try {
    const payload = verify(token, env.jwt.accessSecret, 'access');
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
}

/** 在已通过 authRequired 的处理器里安全取用户 */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
