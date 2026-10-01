import type { AgentInput, CapabilityCatalog } from '../../../shared/types';
import CapabilityPicker from '../CapabilityPicker';

export interface CapabilityPanelProps {
  draft: AgentInput;
  catalog: CapabilityCatalog | null;
  hasKnowledgeBase: boolean;
  onChange: (patch: AgentInput) => void;
}

/** 能力设置：技能与工具 */
export default function CapabilityPanel({ draft, catalog, hasKnowledgeBase, onChange }: CapabilityPanelProps) {
  const tools = draft.tools ?? [];
  const skills = draft.skills ?? [];

  return (
    <>
      <label>技能</label>
      <p className="panel-tip">技能为助手注入领域方法论与输出结构，不占用工具调用名额。</p>
      <CapabilityPicker
        items={catalog?.skills ?? []}
        selected={skills}
        onChange={(next) => onChange({ skills: next })}
        emptyText="能力清单加载中…"
      />

      <label style={{ marginTop: 14 }}>工具</label>
      <p className="panel-tip">
        工具会真实执行动作，勾选越多模型的判断成本越高。
        {!hasKnowledgeBase && '（知识检索需先在「知识库」页上传文档才会生效）'}
      </p>
      <CapabilityPicker
        items={catalog?.tools ?? []}
        selected={tools}
        onChange={(next) => onChange({ tools: next })}
        emptyText="能力清单加载中…"
      />
    </>
  );
}
