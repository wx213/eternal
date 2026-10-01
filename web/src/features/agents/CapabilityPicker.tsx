import type { Capability } from '../../shared/types';

interface CapabilityPickerProps {
  items: Capability[];
  selected: string[];
  onChange: (names: string[]) => void;
  emptyText?: string;
}

/**
 * 能力勾选器
 *
 * 原来创建页与设置弹窗各写了一份几乎相同的勾选逻辑（含高危标记判断），
 * 抽出来后新增能力类型只需改一处，且高危标记直接用后端 risky 字段，不再前端硬编码名单。
 */
export default function CapabilityPicker({ items, selected, onChange, emptyText }: CapabilityPickerProps) {
  if (items.length === 0) {
    return <div className="cap-empty">{emptyText ?? '暂无可用能力'}</div>;
  }

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]);
  };

  return (
    <div className="cap-grid">
      {items.map((item) => (
        <label key={item.name} className="cap-item" title={item.description}>
          <input type="checkbox" checked={selected.includes(item.name)} onChange={() => toggle(item.name)} />
          <span className="cap-text">
            <b>{item.label}</b>
            <i>{item.description}</i>
          </span>
          {item.risky && <span className="risky">高风险</span>}
        </label>
      ))}
    </div>
  );
}
