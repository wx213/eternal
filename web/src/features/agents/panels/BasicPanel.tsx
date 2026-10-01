import type { AgentInput, ContextStrategy } from '../../../shared/types';

export interface BasicPanelProps {
  draft: AgentInput;
  isPersona: boolean;
  onChange: (patch: AgentInput) => void;
}

/** 基础设置：名称、简介、提示词、模型参数 */
export default function BasicPanel({ draft, isPersona, onChange }: BasicPanelProps) {
  const temperature = draft.temperature ?? 0.7;

  return (
    <>
      <label>名称</label>
      <input
        type="text"
        value={draft.name ?? ''}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="智能体名称"
      />

      <label>简介</label>
      <input
        type="text"
        value={draft.description ?? ''}
        onChange={(event) => onChange({ description: event.target.value })}
        placeholder="一句话说明它擅长什么"
      />

      {!isPersona && (
        <>
          <label>人设提示词</label>
          <textarea
            rows={6}
            value={draft.systemPrompt ?? ''}
            onChange={(event) => onChange({ systemPrompt: event.target.value })}
            placeholder="定义它的身份、职责与说话方式"
          />
        </>
      )}

      {isPersona && (
        <p className="panel-tip">
          拟真人格的说话风格来自导入的语料，可在「能力」页调整工具与技能；如需重新学习风格，请重新导入聊天记录。
        </p>
      )}

      <div className="grid2">
        <div>
          <label>模型</label>
          <input
            type="text"
            value={draft.model ?? ''}
            onChange={(event) => onChange({ model: event.target.value })}
            placeholder="留空使用默认模型"
          />
        </div>
        <div>
          <label>发挥空间 {temperature.toFixed(1)}</label>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={temperature}
            onChange={(event) => onChange({ temperature: Number(event.target.value) })}
          />
        </div>
      </div>

      <label>长对话处理</label>
      <div className="segmented">
        {(['trim', 'summarize'] as ContextStrategy[]).map((strategy) => (
          <button
            key={strategy}
            className={(draft.contextStrategy ?? 'trim') === strategy ? 'on' : ''}
            onClick={() => onChange({ contextStrategy: strategy })}
          >
            {strategy === 'trim' ? '直接截断' : '自动摘要'}
          </button>
        ))}
      </div>
    </>
  );
}
