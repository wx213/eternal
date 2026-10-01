import { useEffect, useRef } from 'react';
import Avatar from '../../components/Avatar';
import { IconSparkle } from '../../components/Icons';
import { formatDateChip, isSameDay } from '../../shared/lib/format';
import type { ChatMessage } from '../../shared/types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
  agentId: string;
  agentName: string;
  conversationId: string;
}

export default function MessageList({ messages, agentId, agentName, conversationId }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  // 记录用户是否在底部：不在底部时不要因为新 token 打断其向上翻阅
  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedToBottomRef.current = distance < 80;
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (element && pinnedToBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  // 切换会话时强制回到底部
  useEffect(() => {
    pinnedToBottomRef.current = true;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversationId]);

  const lastMessage = messages[messages.length - 1];
  const waitingFirstToken =
    lastMessage?.role === 'assistant' &&
    lastMessage.streaming === true &&
    !lastMessage.content &&
    lastMessage.trace.length === 0;

  return (
    <div className="msg-area" ref={scrollRef} onScroll={handleScroll}>
      {messages.length === 0 && (
        <div className="chat-empty">
          <div className="ce-icon">
            <IconSparkle size={34} />
          </div>
          <div className="ce-title">和 {agentName} 打个招呼吧</div>
          <div className="ce-desc">Enter 发送，Shift + Enter 换行。也可以点下方快捷技能。</div>
        </div>
      )}

      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const showDate = !previous || !isSameDay(previous.createdAt, message.createdAt);
        const isLast = index === messages.length - 1;

        return (
          <div key={message.id}>
            {showDate && (
              <div className="date-chip-wrap">
                <span className="date-chip">{formatDateChip(message.createdAt)}</span>
              </div>
            )}

            {isLast && waitingFirstToken ? (
              <div className="msg-row in">
                <Avatar colorKey={agentId} name={agentName} size={34} fontSize={13} className="msg-avatar" />
                <div className="typing-bubble" aria-label="正在输入">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ) : (
              <MessageBubble message={message} agentId={agentId} agentName={agentName} />
            )}
          </div>
        );
      })}
    </div>
  );
}
