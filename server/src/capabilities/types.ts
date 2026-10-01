/**
 * 技能（Skill）契约
 *
 * 与原内核的差别：原内核把技能也做成 function call，导致「技能」和「工具」在模型眼里
 * 是同一种东西，参数还得靠位置猜，模型经常错调。
 *
 * 这里把技能还原成它本来的样子：**一个专业化的能力包** =
 *   附加到系统提示词的专家指引 + 它需要的工具集合。
 * 于是技能不占用 function call 名额，不会与工具争抢调用，也不存在参数错配问题。
 */
export interface SkillDefinition {
  name: string;
  /** 面向用户的中文名 */
  label: string;
  description: string;
  /** 注入系统提示词的专家指引（方法论、输出结构、注意事项） */
  instructions: string;
  /** 启用该技能时自动补齐的工具 */
  requiredTools?: string[];
  risky?: boolean;
}

/** 能力清单条目（返回给前端做勾选） */
export interface CapabilityItem {
  name: string;
  label: string;
  description: string;
  risky: boolean;
}

export interface CapabilityCatalog {
  tools: CapabilityItem[];
  skills: CapabilityItem[];
}
