/**
 * 能力注册表 —— 工具与技能的唯一数据源
 *
 * 原实现里能力清单（capabilityCatalog）和能力定义（TOOL_DEFINITIONS）是两套，
 * 高危标记还单独维护了一份名单，改一处忘一处就会漂移。
 * 这里前端清单、提示词、运行时装配全部从同一份定义派生。
 */
import type { ToolDefinition } from '../core/types.js';
import { calculateTool } from './tools/calculator.js';
import { currentDatetimeTool } from './tools/datetime.js';
import { searchKnowledgeTool } from './tools/knowledge.js';
import { fetchWebpageTool } from './tools/webpage.js';
import { SKILLS } from './skills/index.js';
import type { CapabilityCatalog, SkillDefinition } from './types.js';

export const TOOLS: ToolDefinition[] = [searchKnowledgeTool, currentDatetimeTool, calculateTool, fetchWebpageTool];

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
const SKILL_BY_NAME = new Map(SKILLS.map((skill) => [skill.name, skill]));

/** 功能型 Agent 的兜底能力：一个都没勾也不至于变成"哑巴" */
export const BASE_TOOL_NAMES = ['current_datetime'] as const;

export function getCapabilityCatalog(): CapabilityCatalog {
  return {
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      risky: tool.risky === true,
    })),
    skills: SKILLS.map((skill) => ({
      name: skill.name,
      label: skill.label,
      description: skill.description,
      risky: skill.risky === true,
    })),
  };
}

export function isKnownTool(name: string): boolean {
  return TOOL_BY_NAME.has(name);
}

export function isKnownSkill(name: string): boolean {
  return SKILL_BY_NAME.has(name);
}

export interface ResolvedCapabilities {
  tools: ToolDefinition[];
  /** 由启用的技能拼成的附加系统提示词 */
  skillInstructions: string;
  enabledSkills: SkillDefinition[];
}

/**
 * 把「勾选的名字」解析为运行时能力。
 * 技能声明的 requiredTools 会自动并入工具集，用户不需要理解依赖关系。
 */
export function resolveCapabilities(input: {
  toolNames?: readonly string[];
  skillNames?: readonly string[];
  /** 是否挂了知识库；未挂时剔除知识检索工具，避免模型反复调用一个必然失败的工具 */
  hasKnowledgeBase?: boolean;
}): ResolvedCapabilities {
  const enabledSkills = (input.skillNames ?? [])
    .map((name) => SKILL_BY_NAME.get(name))
    .filter((skill): skill is SkillDefinition => Boolean(skill));

  const wanted = new Set<string>([...BASE_TOOL_NAMES, ...(input.toolNames ?? [])]);
  for (const skill of enabledSkills) {
    for (const toolName of skill.requiredTools ?? []) wanted.add(toolName);
  }

  if (!input.hasKnowledgeBase) wanted.delete('search_knowledge');

  const tools = [...wanted]
    .map((name) => TOOL_BY_NAME.get(name))
    .filter((tool): tool is ToolDefinition => Boolean(tool));

  const skillInstructions = enabledSkills.map((skill) => skill.instructions).join('\n\n');

  return { tools, skillInstructions, enabledSkills };
}
