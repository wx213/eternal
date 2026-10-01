import { useMemo, useState } from 'react';
import Avatar from '../../components/Avatar';
import {
  IconBell,
  IconBrain,
  IconChat,
  IconContacts,
  IconGroup,
  IconInfo,
  IconMore,
  IconTrash,
  IconVideo,
  IconVoice,
} from '../../components/Icons';
import { agentsApi } from '../../shared/api';
import { useAgentStore, useChatStore, useUiStore } from '../../shared/store';
import AgentSettingsModal from '../agents/AgentSettingsModal';

/** 通讯录详情列：资料卡 + 信息卡 + 操作卡 */
export default function ContactDetail() {
  const activeId = useUiStore((state) => state.activeContactId);
  const setActiveId = useUiStore((state) => state.setActiveContactId);
  const findAgent = useAgentStore((state) => state.findById);
  const refreshAgents = useAgentStore((state) => state.refresh);
  const catalog = useAgentStore((state) => state.catalog);
  const conversations = useChatStore((state) => state.conversations);
  const openAgent = useChatStore((state) => state.openAgent);
  const refreshConversations = useChatStore((state) => state.refreshConversations);

  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const agent = findAgent(activeId);

  /** 能力名 -> 中文名，展示时优先用后端给的 label */
  const capabilityLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of [...(catalog?.tools ?? []), ...(catalog?.skills ?? [])]) {
      map.set(item.name, item.label);
    }
    return map;
  }, [catalog]);

  if (!agent) {
    return (
      <section className="detail-col">
        <header className="detail-topbar">
          <span className="dt-title">联系人信息</span>
        </header>
        <div className="chat-empty" style={{ background: 'var(--bg-page)' }}>
          <div className="ce-icon" style={{ background: '#fff' }}>
            <IconContacts size={38} />
          </div>
          <div className="ce-title">选择一个联系人</div>
          <div className="ce-desc">从左侧列表选择智能体查看详细资料。</div>
        </div>
      </section>
    );
  }

  const conversationCount = conversations.filter((item) => item.agentId === agent.id).length;
  const typeLabel = agent.type === 'persona' ? '拟真人格' : '功能助手';
  const capabilities = [...agent.tools, ...agent.skills].map((name) => capabilityLabels.get(name) ?? name);

  const handleDelete = async () => {
    if (deleting) return;
    if (!window.confirm(`确定删除智能体「${agent.name}」？该操作不可恢复。`)) return;

    setDeleting(true);
    setError('');
    try {
      await agentsApi.remove(agent.id);
      setActiveId(null);
      await Promise.all([refreshAgents(), refreshConversations()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="detail-col">
      <header className="detail-topbar">
        <span className="dt-title">联系人信息</span>
        <button className="btn-text" onClick={() => setSettingsOpen(true)}>
          编辑
        </button>
      </header>

      <div className="detail-scroll">
        {error && (
          <div className="form-error" style={{ width: '100%', maxWidth: 560 }}>
            {error}
          </div>
        )}

        <div className="card profile-card">
          <Avatar colorKey={agent.id} name={agent.name} size={104} fontSize={42} className="big-avatar" online />
          <div className="pc-name-area">
            <div className="pc-name">{agent.name}</div>
            <div className="pc-status">在线 · {typeLabel}</div>
          </div>

          <div className="quick-actions">
            <button className="qa-item primary" onClick={() => void openAgent(agent.id)}>
              <span className="qa-circle">
                <IconChat size={20} />
              </span>
              <span className="qa-label">发消息</span>
            </button>
            <button className="qa-item" disabled title="暂未开放">
              <span className="qa-circle">
                <IconVoice size={20} />
              </span>
              <span className="qa-label">语音</span>
            </button>
            <button className="qa-item" disabled title="暂未开放">
              <span className="qa-circle">
                <IconVideo size={20} />
              </span>
              <span className="qa-label">视频</span>
            </button>
            <button className="qa-item" onClick={() => setSettingsOpen(true)}>
              <span className="qa-circle">
                <IconMore size={20} />
              </span>
              <span className="qa-label">更多</span>
            </button>
          </div>
        </div>

        <div className="card info-card">
          <div className="info-row">
            <span className="ir-icon">
              <IconBrain />
            </span>
            <div className="ir-mid">
              <div className="ir-value">{agent.model || '默认模型'}</div>
              <div className="ir-label">对话模型</div>
            </div>
          </div>
          <div className="info-row">
            <span className="ir-icon">
              <IconInfo />
            </span>
            <div className="ir-mid">
              <div className="ir-value">{agent.description || '这个智能体还没有简介'}</div>
              <div className="ir-label">简介</div>
            </div>
          </div>
          <div className="info-row">
            <span className="ir-icon">
              <IconContacts />
            </span>
            <div className="ir-mid">
              <div className="ir-value">{capabilities.length > 0 ? capabilities.join('、') : '未配置工具与技能'}</div>
              <div className="ir-label">能力</div>
            </div>
          </div>
        </div>

        <div className="card action-card">
          <div className="action-row">
            <span className="ar-icon">
              <IconGroup />
            </span>
            <span className="ar-label">共同会话</span>
            <span className="ar-extra">{conversationCount}</span>
          </div>
          <div className="action-row">
            <span className="ar-icon">
              <IconBrain />
            </span>
            <span className="ar-label">知识库</span>
            <span className="ar-extra">{agent.hasKnowledgeBase ? '已挂载' : '未配置'}</span>
          </div>
          <button className="action-row clickable" onClick={() => setMuted((value) => !value)} aria-pressed={muted}>
            <span className="ar-icon">
              <IconBell />
            </span>
            <span className="ar-label">消息免打扰</span>
            <span className={`toggle ${muted ? 'on' : ''}`} />
          </button>
          <button className="action-row clickable danger" onClick={() => void handleDelete()} disabled={deleting}>
            <span className="ar-icon">
              <IconTrash />
            </span>
            <span className="ar-label">{deleting ? '删除中…' : '删除智能体'}</span>
          </button>
        </div>
      </div>

      {settingsOpen && <AgentSettingsModal agent={agent} onClose={() => setSettingsOpen(false)} />}
    </section>
  );
}
