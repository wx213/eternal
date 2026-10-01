import { useMemo } from 'react';
import Avatar from '../../components/Avatar';
import { IconPlus, IconSearch } from '../../components/Icons';
import { groupLetter } from '../../shared/lib/format';
import { useAgentStore, useUiStore } from '../../shared/store';
import type { Agent } from '../../shared/types';

/** 通讯录列表列：按首字母分组的智能体 */
export default function ContactListColumn() {
  const agents = useAgentStore((state) => state.agents);
  const activeId = useUiStore((state) => state.activeContactId);
  const setActiveId = useUiStore((state) => state.setActiveContactId);
  const keyword = useUiStore((state) => state.keyword);
  const setKeyword = useUiStore((state) => state.setKeyword);
  const setView = useUiStore((state) => state.setView);

  const groups = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const filtered = query
      ? agents.filter(
          (agent) =>
            agent.name.toLowerCase().includes(query) || agent.description.toLowerCase().includes(query),
        )
      : agents;

    const map = new Map<string, Agent[]>();
    for (const agent of filtered) {
      const letter = groupLetter(agent.name);
      const list = map.get(letter);
      if (list) list.push(agent);
      else map.set(letter, [agent]);
    }

    return [...map.entries()]
      .map(([letter, list]) => ({
        letter,
        list: [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
      }))
      .sort((a, b) => {
        // '#' 分组固定排在最后
        if (a.letter === '#') return 1;
        if (b.letter === '#') return -1;
        return a.letter.localeCompare(b.letter);
      });
  }, [agents, keyword]);

  return (
    <section className="list-col">
      <header className="list-header titled">
        <span className="list-title">通讯录</span>
        <button
          className="header-round-btn"
          onClick={() => setView('create-agent')}
          title="添加智能体"
          aria-label="添加智能体"
        >
          <IconPlus size={18} />
        </button>
      </header>

      <div className="search-wrap">
        <div className="search-bar">
          <span className="icon">
            <IconSearch />
          </span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索联系人"
            aria-label="搜索联系人"
          />
        </div>
      </div>

      <div className="list-scroll">
        {groups.map((group) => (
          <div key={group.letter}>
            <div className="group-letter">{group.letter}</div>
            {group.list.map((agent) => (
              <button
                key={agent.id}
                className={`contact-row ${activeId === agent.id ? 'active' : ''}`}
                onClick={() => setActiveId(agent.id)}
              >
                <Avatar
                  colorKey={agent.id}
                  name={agent.name}
                  size={46}
                  fontSize={18}
                  className="contact-avatar"
                  online
                  dotBorderColor={activeId === agent.id ? '#eaf4fe' : '#fff'}
                />
                <div className="contact-mid">
                  <div className="contact-name">{agent.name}</div>
                  <div className="contact-status online">
                    {agent.type === 'persona' ? '在线 · 拟真人格' : '在线'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="list-empty">
            {keyword.trim() ? (
              <>没有匹配「{keyword.trim()}」的联系人</>
            ) : (
              <>
                通讯录还是空的
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
