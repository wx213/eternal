import { useEffect, useMemo, useState } from 'react';
import { agentsApi } from '../../shared/api';
import { useAgentStore, useChatStore } from '../../shared/store';
import type { Agent, AgentInput } from '../../shared/types';
import BasicPanel from './panels/BasicPanel';
import CapabilityPanel from './panels/CapabilityPanel';
import KnowledgePanel from './panels/KnowledgePanel';
import MemoryPanel from './panels/MemoryPanel';

type Tab = 'basic' | 'capability' | 'knowledge' | 'memory';

const TABS: { key: Tab; label: string }[] = [
  { key: 'basic', label: '基础' },
  { key: 'capability', label: '能力' },
  { key: 'knowledge', label: '知识库' },
  { key: 'memory', label: '记忆' },
];

/** 从 Agent 记录提取可编辑字段 */
function toDraft(agent: Agent): AgentInput {
  return {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: agent.model ?? '',
    temperature: agent.temperature,
    contextStrategy: agent.contextStrategy,
    tools: [...agent.tools],
    skills: [...agent.skills],
  };
}

export default function AgentSettingsModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const catalog = useAgentStore((state) => state.catalog);
  const loadCatalog = useAgentStore((state) => state.loadCatalog);
  const refreshAgents = useAgentStore((state) => state.refresh);
  const conversations = useChatStore((state) => state.conversations);
  const refreshConversations = useChatStore((state) => state.refreshConversations);

  const [tab, setTab] = useState<Tab>('basic');
  const [draft, setDraft] = useState<AgentInput>(() => toDraft(agent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadCatalog().catch(() => undefined);
  }, [loadCatalog]);

  // 外部 agent 变化（如知识库上传后刷新）时同步草稿
  useEffect(() => {
    setDraft(toDraft(agent));
  }, [agent]);

  const conversationId = useMemo(
    () => conversations.find((item) => item.agentId === agent.id)?.id ?? null,
    [conversations, agent.id],
  );

  const patch = (partial: AgentInput) => {
    setSaved(false);
    setDraft((previous) => ({ ...previous, ...partial }));
  };

  const save = async () => {
    if (saving) return;

    const name = draft.name?.trim();
    if (!name) {
      setError('名称不能为空');
      return;
    }

    setError('');
    setSaving(true);
    try {
      await agentsApi.update(agent.id, {
        ...draft,
        name,
        description: draft.description?.trim() ?? '',
        systemPrompt: draft.systemPrompt?.trim() ?? '',
        // 模型留空表示使用服务端默认值
        model: draft.model?.trim() ?? '',
      });
      await Promise.all([refreshAgents(), refreshConversations()]);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const isPersona = agent.type === 'persona';
  // 知识库与记忆是即时生效的独立操作，不需要"保存"
  const needsSave = tab === 'basic' || tab === 'capability';

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          {agent.name}
          <span className={`badge ${isPersona ? 'persona' : 'functional'}`}>
            {isPersona ? '拟真人格' : '功能助手'}
          </span>
        </h2>

        <div className="tabs">
          {TABS.map((item) => (
            <button
              key={item.key}
              className={`tab ${tab === item.key ? 'active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          {saved && needsSave && <div className="ok-msg">已保存</div>}

          {tab === 'basic' && <BasicPanel draft={draft} isPersona={isPersona} onChange={patch} />}

          {tab === 'capability' && (
            <CapabilityPanel
              draft={draft}
              catalog={catalog}
              hasKnowledgeBase={agent.hasKnowledgeBase}
              onChange={patch}
            />
          )}

          {tab === 'knowledge' && (
            <KnowledgePanel agentId={agent.id} onChanged={() => void refreshAgents()} />
          )}

          {tab === 'memory' && <MemoryPanel agentId={agent.id} conversationId={conversationId} />}
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            关闭
          </button>
          {needsSave && (
            <button className="btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
