import { useMemo } from 'react';
import Avatar from '../../components/Avatar';
import { IconSearch } from '../../components/Icons';
import { formatListTime } from '../../shared/lib/format';
import { useAgentStore, useChatStore, useUiStore } from '../../shared/store';

interface ListRow {
  key: string;
  agentId: string;
  name: string;
  type: string;
  preview: string;
  time: number;
}

/** 会话列表列：搜索 + 过滤 + 会话行 */
export default function ChatListColumn() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversation = useChatStore((state) => state.activeConversation);
  const openAgent = useChatStore((state) => state.openAgent);
  const agents = useAgentStore((state) => state.agents);
  const filter = useUiStore((state) => state.chatFilter);
  const setFilter = useUiStore((state) => state.setChatFilter);
  const keyword = useUiStore((state) => state.keyword);
  const setKeyword = useUiStore((state) => state.setKeyword);
  const setView = useUiStore((state) => state.setView);

  /** 展示项 = 已有会话 + 尚未开聊的 Agent，让新建的 Agent 也能出现在列表里 */
  const rows = useMemo<ListRow[]>(() => {
    const conversedAgentIds = new Set(conversations.map((item) => item.agentId));

    const existing: ListRow[] = conversations.map((item) => ({
      key: item.id,
      agentId: item.agentId,
      name: item.agentName,
      type: item.agentType,
      preview: item.lastMessage || '暂无消息',
      time: item.lastMessageAt ?? 0,
    }));

    const pending: ListRow[] = agents
      .filter((agent) => !conversedAgentIds.has(agent.id))
      .map((agent) => ({
        key: `agent_${agent.id}`,
        agentId: agent.id,
        name: agent.name,
        type: agent.type,
        preview: agent.description || '还没有聊过，点击开始对话',
        time: 0,
      }));

    const all = [...existing, ...pending];
    const byType = filter === 'persona' ? all.filter((row) => row.type === 'persona') : all;

    const query = keyword.trim().toLowerCase();
    const byKeyword = query
      ? byType.filter(
          (row) => row.name.toLowerCase().includes(query) || row.preview.toLowerCase().includes(query),
        )
      : byType;

    return byKeyword.sort((a, b) => b.time - a.time);
  }, [conversations, agents, filter, keyword]);

  return (
    <section className="list-col">
      <header className="list-header">
        <div className="search-bar">
          <span className="icon">
            <IconSearch />
          </span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索"
            aria-label="搜索会话"
          />
        </div>
      </header>

      <div className="filter-tabs">
        <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          全部
        </button>
        <button
          className={`filter-tab ${filter === 'persona' ? 'active' : ''}`}
          onClick={() => setFilter('persona')}
        >
          拟真人格
        </button>
      </div>

      <div className="list-scroll">
        {rows.map((row) => (
          <button
            key={row.key}
            className={`conv-row ${activeConversation?.agentId === row.agentId ? 'active' : ''}`}
            onClick={() => void openAgent(row.agentId)}
            title={row.preview}
          >
            <Avatar colorKey={row.agentId} name={row.name} size={48} className="conv-avatar" />
            <div className="conv-mid">
              <div className="conv-line1">
                <span className="conv-name">{row.name}</span>
                {row.time > 0 && <span className="conv-time">{formatListTime(row.time)}</span>}
              </div>
              <div className="conv-line2">
                <span className="conv-msg">{row.preview}</span>
              </div>
            </div>
          </button>
        ))}

        {rows.length === 0 && (
          <div className="list-empty">
            {keyword.trim() ? (
              <>没有匹配「{keyword.trim()}」的会话</>
            ) : (
              <>
                还没有智能体
                <br />
                <button className="btn-text" style={{ marginTop: 8 }} onClick={() => setView('create-agent')}>
                  创建一个智能体
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
