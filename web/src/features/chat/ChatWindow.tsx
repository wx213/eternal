import { useState } from 'react';
import Avatar from '../../components/Avatar';
import { IconChat, IconMore, IconSearch } from '../../components/Icons';
import { useAgentStore, useChatStore, useUiStore } from '../../shared/store';
import AgentSettingsModal from '../agents/AgentSettingsModal';
import Composer from './Composer';
import MessageList from './MessageList';

export default function ChatWindow() {
  const conversation = useChatStore((state) => state.activeConversation);
  const messages = useChatStore((state) => state.messages);
  const streaming = useChatStore((state) => state.streaming);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const findAgent = useAgentStore((state) => state.findById);
  const setView = useUiStore((state) => state.setView);

  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!conversation) {
    return (
      <section className="chat-window">
        <div className="chat-empty">
          <div className="ce-icon">
            <IconChat size={38} />
          </div>
          <div className="ce-title">选择一个会话开始聊天</div>
          <div className="ce-desc">
            从左侧列表选择一个智能体，或者创建一个属于你自己的智能体 —— 支持导入聊天记录克隆说话风格。
          </div>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setView('create-agent')}>
            创建智能体
          </button>
        </div>
      </section>
    );
  }

  const agent = findAgent(conversation.agentId);

  const statusText = streaming
    ? '正在输入…'
    : conversation.agentType === 'persona'
      ? '在线 · 拟真人格'
      : '在线 · 随时为你服务';

  return (
    <section className="chat-window">
      <header className="chat-header">
        <Avatar
          colorKey={conversation.agentId}
          name={conversation.agentName}
          size={42}
          fontSize={15}
          className="peer-avatar"
        />
        <div className="peer-info">
          <div className="peer-name">{conversation.agentName}</div>
          <div className={`peer-status ${streaming ? 'busy' : ''}`}>{statusText}</div>
        </div>
        <div className="header-actions">
          <button className="header-icon-btn" title="搜索消息" aria-label="搜索消息" disabled>
            <IconSearch size={20} />
          </button>
          <button
            className="header-icon-btn"
            title="智能体设置"
            aria-label="智能体设置"
            onClick={() => setSettingsOpen(true)}
            disabled={!agent}
          >
            <IconMore />
          </button>
        </div>
      </header>

      <MessageList
        messages={messages}
        agentId={conversation.agentId}
        agentName={conversation.agentName}
        conversationId={conversation.id}
      />

      <Composer
        streaming={streaming}
        conversationId={conversation.id}
        onSend={(text) => void sendMessage(text)}
        onStop={() => void stopStreaming()}
      />

      {settingsOpen && agent && <AgentSettingsModal agent={agent} onClose={() => setSettingsOpen(false)} />}
    </section>
  );
}
