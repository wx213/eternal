/**
 * zod 请求校验
 *
 * 校验后用「解析结果」覆盖原始输入，后续处理器拿到的是已净化、已带默认值的数据，
 * 从而避免未校验字段被误用。
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../../shared/errors.js';

type Source = 'body' | 'query' | 'params';

function validate(schema: ZodTypeAny, source: Source): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        AppError.validation(
          '参数校验失败',
          result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        ),
      );
      return;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export const validateBody = (schema: ZodTypeAny): RequestHandler => validate(schema, 'body');
export const validateQuery = (schema: ZodTypeAny): RequestHandler => validate(schema, 'query');
export const validateParams = (schema: ZodTypeAny): RequestHandler => validate(schema, 'params');

/** 在处理器里以类型安全的方式取校验结果 */
export function body<S extends ZodTypeAny>(req: Request, _schema: S): z.infer<S> {
  return req.body as z.infer<S>;
}
export function query<S extends ZodTypeAny>(req: Request, _schema: S): z.infer<S> {
  return req.query as z.infer<S>;
}

/**
 * 读取路径参数。
 * Express 5 的 params 类型为 string | string[] | undefined，这里统一收窄并顺带做非空与长度校验。
 */
export function pathParam(req: Request, name: string, maxLength = 64): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw AppError.badRequest(`缺少路径参数 ${name}`);
  }
  if (value.length > maxLength) {
    throw AppError.badRequest(`路径参数 ${name} 过长`);
  }
  return value;
}
