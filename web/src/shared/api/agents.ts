import { http } from './client';
import type {
  Agent,
  AgentInput,
  CapabilityCatalog,
  Corpus,
  KnowledgeDocument,
  KnowledgeSummary,
  PersonaProfile,
} from '../types';

export const agentsApi = {
  list: () => http.get<{ agents: Agent[] }>('/agents'),
  get: (id: string) => http.get<{ agent: Agent }>(`/agents/${id}`),
  create: (input: AgentInput) => http.post<{ agent: Agent }>('/agents', input),
  update: (id: string, input: AgentInput) => http.patch<{ agent: Agent }>(`/agents/${id}`, input),
  remove: (id: string) => http.delete<{ ok: boolean }>(`/agents/${id}`),

  capabilities: () => http.get<CapabilityCatalog>('/agents/capabilities'),

  // ---------- 拟真人格语料 ----------
  listCorpora: (id: string) => http.get<{ corpora: Corpus[] }>(`/agents/${id}/corpora`),

  uploadCorpusText: (id: string, profileText: string) =>
    http.post<{ corpus: { id: string; size: number } }>(`/agents/${id}/corpora`, { profileText }),

  uploadCorpusFile: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<{ corpus: { id: string; size: number } }>(`/agents/${id}/corpora`, form);
  },

  extractPersona: (id: string, speaker?: string) =>
    http.post<{ personaProfile: PersonaProfile; agent: Agent }>(`/agents/${id}/persona/extract`, { speaker }),

  // ---------- 知识库 ----------
  listKnowledge: (id: string) =>
    http.get<{ summary: KnowledgeSummary; documents: KnowledgeDocument[] }>(`/agents/${id}/knowledge/documents`),

  uploadKnowledgeText: (id: string, title: string, text: string) =>
    http.post<{ document: KnowledgeDocument }>(`/agents/${id}/knowledge/documents`, { title, text }),

  uploadKnowledgeFile: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<{ document: KnowledgeDocument }>(`/agents/${id}/knowledge/documents`, form);
  },

  removeKnowledgeDocument: (id: string, docId: string) =>
    http.delete<{ ok: boolean }>(`/agents/${id}/knowledge/documents/${docId}`),

  // ---------- 长期记忆（按会话隔离） ----------
  getMemory: (id: string, conversationId: string) =>
    http.get<{ memory: string }>(`/agents/${id}/memory?conversationId=${encodeURIComponent(conversationId)}`),

  clearMemory: (id: string, conversationId: string) =>
    http.delete<{ ok: boolean }>(`/agents/${id}/memory?conversationId=${encodeURIComponent(conversationId)}`),
};
