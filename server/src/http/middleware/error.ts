/**
 * 统一错误与 404 处理
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { env } from '../../config/env.js';
import { AppError, isAbortError } from '../../shared/errors.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('http');

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `接口不存在：${req.method} ${req.path}` } });
}

function normalize(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return AppError.validation(
      '参数校验失败',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (error instanceof MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? '文件超过大小上限' : `文件上传失败：${error.message}`;
    return new AppError(error.code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', message);
  }

  // body-parser 的 JSON 解析错误
  if (error instanceof SyntaxError && 'body' in error) {
    return AppError.badRequest('请求体不是合法的 JSON');
  }

  const status = (error as { status?: number })?.status;
  if (status === 403) {
    return AppError.forbidden((error as Error).message);
  }

  return AppError.internal('服务器内部错误', error);
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  // 客户端断开连接不是故障，静默处理
  if (isAbortError(error)) {
    if (!res.writableEnded) res.end();
    return;
  }

  if (res.headersSent) {
    // SSE 等已开始输出的响应无法再改状态码，直接结束
    log.warn('响应已开始后出错', { path: req.path, error });
    if (!res.writableEnded) res.end();
    return;
  }

  const appError = normalize(error);

  if (appError.status >= 500) {
    log.error('请求处理失败', { method: req.method, path: req.path, code: appError.code, error });
  } else {
    log.debug('请求被拒绝', { method: req.method, path: req.path, code: appError.code, message: appError.message });
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      // 生产环境不回传内部堆栈
      ...(!env.isProduction && appError.status >= 500 && error instanceof Error ? { stack: error.stack } : {}),
    },
  });

  void next;
}
