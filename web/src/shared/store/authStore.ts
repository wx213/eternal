import { create } from 'zustand';
import { authApi, tokenStore } from '../api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  /** 首次引导是否完成（用于避免闪登录页） */
  ready: boolean;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,

  bootstrap: async () => {
    if (!tokenStore.access) {
      set({ ready: true });
      return;
    }
    try {
      const { user } = await authApi.me();
      set({ user, ready: true });
    } catch {
      tokenStore.clear();
      set({ user: null, ready: true });
    }
  },

  login: async (email, password) => {
    const result = await authApi.login({ email, password });
    tokenStore.save(result.accessToken, result.refreshToken);
    set({ user: result.user });
  },

  register: async (email, password, displayName) => {
    const result = await authApi.register({ email, password, ...(displayName ? { displayName } : {}) });
    tokenStore.save(result.accessToken, result.refreshToken);
    set({ user: result.user });
  },

  logout: () => {
    tokenStore.clear();
    set({ user: null });
  },
}));
