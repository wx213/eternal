import { http } from './client';
import type { User } from '../types';

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  register: (input: { email: string; password: string; displayName?: string }) =>
    http.post<AuthResponse>('/auth/register', input),

  login: (input: { email: string; password: string }) => http.post<AuthResponse>('/auth/login', input),

  refresh: (refreshToken: string) => http.post<AuthResponse>('/auth/refresh', { refreshToken }),

  me: () => http.get<{ user: User }>('/auth/me'),
};
