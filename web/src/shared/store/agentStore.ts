import { create } from 'zustand';
import { agentsApi } from '../api';
import type { Agent, CapabilityCatalog } from '../types';

interface AgentState {
  agents: Agent[];
  /** 能力清单来自后端注册表，进程内只需拉一次 */
  catalog: CapabilityCatalog | null;

  refresh: () => Promise<Agent[]>;
  loadCatalog: () => Promise<CapabilityCatalog>;
  findById: (id: string | null) => Agent | null;
  reset: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  catalog: null,

  refresh: async () => {
    const { agents } = await agentsApi.list();
    set({ agents });
    return agents;
  },

  loadCatalog: async () => {
    const cached = get().catalog;
    if (cached) return cached;
    const catalog = await agentsApi.capabilities();
    set({ catalog });
    return catalog;
  },

  findById: (id) => (id ? get().agents.find((agent) => agent.id === id) ?? null : null),

  reset: () => set({ agents: [] }),
}));
