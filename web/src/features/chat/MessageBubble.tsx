import { useState } from 'react';
import Avatar from '../../components/Avatar';
import { formatBubbleTime } from '../../shared/lib/format';
import type { ChatMessage } from '../../shared/types';
import ToolTrace from './ToolTrace';

interface MessageBubbleProps {
  message: ChatMessage;
  agentId: string;
  agentName: string;
}

export default function MessageBubble({ message, agentId, agentName }: MessageBubbleProps) {
  const isOutgoing = message.role === 'user';

  return (
    <div className={`msg-row ${isOutgoing ? 'out' : 'in'}`}>
      {!isOutgoing && (
        <Avatar colorKey={agentId} name={agentName} size={34} fontSize={13} className="msg-avatar" />
      )}
      <div className={`bubble ${isOutgoing ? 'out' : 'in'}`}>
        {!isOutgoing && <div className="bubble-sender">{agentName}</div>}
        {!isOutgoing && message.reasoning ? <ReasoningBlock text={message.reasoning} /> : null}
        {!isOutgoing && <ToolTrace trace={message.trace} />}

        {message.content && <div className="bubble-text">{message.content}</div>}
        {message.error && <div className="bubble-error">⚠️ {message.error}</div>}

        <div className="bubble-meta">{formatBubbleTime(message.createdAt)}</div>
      </div>
    </div>
  );
}

/** 思维链默认折叠：它对排查有用，但会淹没正文 */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`reasoning ${open ? 'open' : ''}`}>
      <button className="reasoning-toggle" onClick={() => setOpen((value) => !value)}>
        {open ? '收起思考过程' : '查看思考过程'}
      </button>
      {open && <div className="reasoning-text">{text}</div>}
    </div>
  );
}
