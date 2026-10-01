/**
 * HTTP 客户端
 *
 * 统一处理：token 注入、错误码解析、401 全局登出。
 * 相比原实现，错误被包装成带 code 的 ApiError，调用方可以按码分支而不是靠比对中文文案。
 */
import type { ApiErrorBody } from '../types';

const BASE = '/api/v1';
const ACCESS_KEY = 'agentchat.accessToken';
const REFRESH_KEY = 'agentchat.refreshToken';

/** 401 时广播，由 App 统一回登录页 */
export const UNAUTHORIZED_EVENT = 'agentchat:unauthorized';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY) ?? '';
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY) ?? '';
  },
  save(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export function authHeader(): Record<string, string> {
  const token = tokenStore.access;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function notifyUnauthorized(path: string) {
  // 登录/注册接口自身的 401 是"密码错误"，不应触发全局登出
  if (path.startsWith('/auth/')) return;
  tokenStore.clear();
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

async function toApiError(response: Response, path: string): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // 非 JSON 响应（网关错误页等）
  }

  if (response.status === 401) notifyUnauthorized(path);

  return new ApiError(
    response.status,
    body?.error?.code ?? 'HTTP_ERROR',
    body?.error?.message ?? `请求失败（${response.status}）`,
    body?.error?.details,
  );
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      // FormData 由浏览器自动设置带 boundary 的 Content-Type
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeader(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) throw await toApiError(response, path);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
