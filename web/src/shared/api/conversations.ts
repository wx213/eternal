import { http } from './client';
import type { Conversation, Message } from '../types';

export const conversationsApi = {
  list: () => http.get<{ conversations: Conversation[] }>('/conversations'),

  open: (agentId: string) => http.post<{ conversation: Conversation }>('/conversations/open', { agentId }),

  listMessages: (id: string) => http.get<{ messages: Message[] }>(`/conversations/${id}/messages`),

  setPinned: (id: string, pinned: boolean) =>
    http.patch<{ conversation: Conversation }>(`/conversations/${id}/pin`, { pinned }),

  /** 服务端中止：客户端断流后模型可能仍在跑，需要显式通知后端停 */
  abort: (id: string) => http.post<{ ok: boolean; aborted: boolean }>(`/conversations/${id}/abort`),
};
