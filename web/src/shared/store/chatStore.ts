/**
 * 聊天状态与流式编排
 *
 * 把流式接管从组件搬到 store 的原因：原实现的 AbortController 存在 ChatWindow 的 ref 里，
 * 组件卸载/切换会话时状态与请求生命周期容易脱节。放到 store 后，
 * 「谁在流式、如何中止」只有一处真相。
 */
import { create } from 'zustand';
import { conversationsApi, streamChat } from '../api';
import type { AgentEvent, ChatMessage, Conversation, ToolTraceView } from '../types';

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  streaming: boolean;

  refreshConversations: () => Promise<void>;
  openAgent: (agentId: string) => Promise<void>;
  selectConversation: (conversation: Conversation) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => Promise<void>;
  reset: () => void;
}

/** 当前进行中的流式请求控制器。放模块作用域而非 state：它不参与渲染。 */
let activeController: AbortController | null = null;

const localId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useChatStore = create<ChatState>((set, get) => {
  /** 更新最后一条助手消息 */
  const patchAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
    const messages = [...get().messages];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const current = messages[i];
      if (current && current.role === 'assistant') {
        messages[i] = updater(current);
        set({ messages });
        return;
      }
    }
  };

  const handleEvent = (event: AgentEvent) => {
    switch (event.type) {
      case 'delta':
        patchAssistant((message) => ({ ...message, content: message.content + event.text }));
        break;

      case 'reasoning':
        patchAssistant((message) => ({ ...message, reasoning: (message.reasoning ?? '') + event.text }));
        break;

      case 'tool.start':
        patchAssistant((message) => ({
          ...message,
          trace: [
            ...message.trace,
            {
              id: event.id,
              name: event.name,
              label: event.label,
              ok: true,
              durationMs: 0,
              summary: '执行中…',
              running: true,
            } satisfies ToolTraceView,
          ],
        }));
        break;

      case 'tool.end':
        patchAssistant((message) => ({
          ...message,
          trace: message.trace.map((entry) =>
            entry.id === event.id
              ? {
                  id: event.id,
                  name: event.name,
                  label: event.label,
                  ok: event.ok,
                  durationMs: event.durationMs,
                  summary: event.summary,
                  running: false,
                }
              : entry,
          ),
        }));
        break;

      case 'done':
        // done 是权威结果：以它覆盖流式期间拼接的内容与轨迹
        patchAssistant((message) => ({
          ...message,
          content: event.text || message.content,
          trace: event.trace.length > 0 ? event.trace : message.trace.filter((entry) => !entry.running),
          streaming: false,
        }));
        break;

      case 'error':
        patchAssistant((message) => ({ ...message, error: event.message, streaming: false }));
        break;
    }
  };

  return {
    conversations: [],
    activeConversation: null,
    messages: [],
    streaming: false,

    refreshConversations: async () => {
      const { conversations } = await conversationsApi.list();
      set({ conversations });
    },

    openAgent: async (agentId) => {
      const { conversation } = await conversationsApi.open(agentId);
      await get().selectConversation(conversation);
      await get().refreshConversations();
    },

    selectConversation: async (conversation) => {
      // 切会话先断掉上一个流，避免消息串到新会话里
      activeController?.abort();
      activeController = null;

      set({ activeConversation: conversation, messages: [], streaming: false });
      const { messages } = await conversationsApi.listMessages(conversation.id);
      // 仅当用户没有再次切换时才应用结果
      if (get().activeConversation?.id !== conversation.id) return;
      set({ messages });
    },

    sendMessage: async (text) => {
      const conversation = get().activeConversation;
      const content = text.trim();
      if (!conversation || !content || get().streaming) return;

      const now = Date.now();
      const userMessage: ChatMessage = {
        id: localId('u'),
        role: 'user',
        content,
        trace: [],
        createdAt: now,
      };
      const assistantMessage: ChatMessage = {
        id: localId('a'),
        role: 'assistant',
        content: '',
        trace: [],
        createdAt: now + 1,
        streaming: true,
      };

      set({ messages: [...get().messages, userMessage, assistantMessage], streaming: true });

      const controller = new AbortController();
      activeController = controller;

      try {
        await streamChat({
          conversationId: conversation.id,
          message: content,
          signal: controller.signal,
          onEvent: handleEvent,
        });
      } catch (error) {
        // 用户主动中止不算异常
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : '发送失败';
          patchAssistant((current) => ({ ...current, error: message, streaming: false }));
        }
      } finally {
        if (activeController === controller) activeController = null;
        patchAssistant((current) => ({ ...current, streaming: false }));
        set({ streaming: false });
        void get().refreshConversations();
      }
    },

    stopStreaming: async () => {
      const conversation = get().activeConversation;
      activeController?.abort();
      activeController = null;
      set({ streaming: false });

      // 断开客户端连接不代表后端停了，必须显式通知，否则模型继续消耗额度
      if (conversation) {
        try {
          await conversationsApi.abort(conversation.id);
        } catch {
          // 中止接口失败不影响前端状态
        }
      }
    },

    reset: () => {
      activeController?.abort();
      activeController = null;
      set({ conversations: [], activeConversation: null, messages: [], streaming: false });
    },
  };
});
