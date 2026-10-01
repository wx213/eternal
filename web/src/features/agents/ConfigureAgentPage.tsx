import { useEffect, useState } from 'react';
import { IconBack } from '../../components/Icons';
import { agentsApi } from '../../shared/api';
import { useAgentStore, useChatStore, useUiStore } from '../../shared/store';
import type { ContextStrategy } from '../../shared/types';
import CapabilityPicker from './CapabilityPicker';

/** 模型留空即用服务端默认值，这里只做输入提示 */
const MODEL_HINT = '留空使用服务端默认模型';

/** 配置功能助手 */
export default function ConfigureAgentPage() {
  const setView = useUiStore((state) => state.setView);
  const catalog = useAgentStore((state) => state.catalog);
  const loadCatalog = useAgentStore((state) => state.loadCatalog);
  const refreshAgents = useAgentStore((state) => state.refresh);
  const openAgent = useChatStore((state) => state.openAgent);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [contextStrategy, setContextStrategy] = useState<ContextStrategy>('trim');
  const [tools, setTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadCatalog().catch(() => setError('能力清单加载失败，可稍后在设置里补充'));
  }, [loadCatalog]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请填写助手名称');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const { agent } = await agentsApi.create({
        name: trimmedName,
        type: 'functional',
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        temperature,
        contextStrategy,
        tools,
        skills,
        ...(model.trim() ? { model: model.trim() } : {}),
      });

      await refreshAgents();
      await openAgent(agent.id);
      setView('chats');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flow-page">
      <header className="flow-topbar">
        <button className="ft-back" onClick={() => setView('create-agent')} aria-label="返回">
          <IconBack />
        </button>
        <span className="ft-title">配置功能助手</span>
      </header>

      <div className="flow-scroll">
        <div className="flow-head">
          <h1>配置一个专属助手</h1>
          <p>写清它的职责与说话方式，再挑选需要的工具和专业技能。</p>
        </div>

        <div className="form-card">
          {error && <div className="form-error">{error}</div>}

          <div className="field">
            <label className="field-label">名称</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：代码审查助手、数据分析师"
            />
          </div>

          <div className="field">
            <label className="field-label">简介</label>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="一句话说明它擅长什么"
            />
          </div>

          <div className="field">
            <label className="field-label">人设提示词</label>
            <textarea
              rows={6}
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="你是一位资深后端工程师，回答简洁、直指要点，遇到不确定的地方会明确说明…"
            />
            <span className="field-hint">留空则由系统按名称与简介自动生成。</span>
          </div>

          <div className="field">
            <label className="field-label">技能</label>
            <span className="field-hint">技能会给助手注入对应领域的方法论与输出结构。</span>
            <CapabilityPicker
              items={catalog?.skills ?? []}
              selected={skills}
              onChange={setSkills}
              emptyText="能力清单加载中…"
            />
          </div>

          <div className="field">
            <label className="field-label">工具</label>
            <span className="field-hint">只有确实需要时才勾选；工具越多，模型的选择成本越高。</span>
            <CapabilityPicker
              items={catalog?.tools ?? []}
              selected={tools}
              onChange={setTools}
              emptyText="能力清单加载中…"
            />
          </div>

          <div className="grid2">
            <div className="field">
              <label className="field-label">模型</label>
              <input value={model} onChange={(event) => setModel(event.target.value)} placeholder={MODEL_HINT} />
            </div>

            <div className="field">
              <label className="field-label">发挥空间 {temperature.toFixed(1)}</label>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
              />
              <span className="field-hint">数值越低越稳定，越高越有创意。</span>
            </div>
          </div>

          <div className="field">
            <label className="field-label">长对话处理</label>
            <div className="segmented">
              <button
                className={contextStrategy === 'trim' ? 'on' : ''}
                onClick={() => setContextStrategy('trim')}
              >
                直接截断
              </button>
              <button
                className={contextStrategy === 'summarize' ? 'on' : ''}
                onClick={() => setContextStrategy('summarize')}
              >
                自动摘要
              </button>
            </div>
            <span className="field-hint">摘要会保留早期对话要点，但每次压缩会多一次模型调用。</span>
          </div>

          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? '创建中…' : '创建并开始聊天'}
          </button>
        </div>
      </div>
    </section>
  );
}
