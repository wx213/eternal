/**
 * 统一错误模型
 *
 * 所有对外错误都携带稳定的 code，便于前端按码分支处理，
 * 且 message 只暴露可安全展示的信息（内部细节走 cause + 日志）。
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'LLM_NOT_CONFIGURED'
  | 'ABORTED'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  LLM_NOT_CONFIGURED: 503,
  ABORTED: 499,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: { details?: unknown; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError('BAD_REQUEST', message, { details });
  }

  static validation(message: string, details?: unknown) {
    return new AppError('VALIDATION_FAILED', message, { details });
  }

  static unauthorized(message = '未认证或认证已失效') {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = '无权访问该资源') {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = '资源不存在') {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new AppError('CONFLICT', message);
  }

  static upstream(message: string, cause?: unknown) {
    return new AppError('UPSTREAM_ERROR', message, { cause });
  }

  static internal(message = '服务器内部错误', cause?: unknown) {
    return new AppError('INTERNAL_ERROR', message, { cause });
  }
}

/** 请求被主动中止（客户端断开 / 用户点停止），属于正常流程而非故障 */
export class AbortError extends Error {
  readonly reason: string;

  constructor(reason = 'aborted') {
    super(`请求已中止：${reason}`);
    this.name = 'AbortError';
    this.reason = reason;
  }
}

export function isAbortError(error: unknown): error is AbortError {
  if (error instanceof AbortError) return true;
  // 兼容 fetch / AbortController 抛出的原生中止错误
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'APIUserAbortError');
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '未知错误';
}
