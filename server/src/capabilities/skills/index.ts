/**
 * 内置技能
 *
 * 技能是「专家人格 + 方法论 + 输出结构」的封装，纯提示词实现，因此天然安全、可预期。
 */
import type { SkillDefinition } from '../types.js';

const codeReview: SkillDefinition = {
  name: 'code_review',
  label: '代码审查',
  description: '按工程标准审查代码，指出缺陷、风险与改进点',
  instructions: [
    '### 代码审查方法',
    '当用户提供代码并希望评审时，按以下顺序检查并输出：',
    '1. 正确性：边界条件、空值、异常路径、并发与竞态。',
    '2. 安全性：注入、越权、密钥硬编码、不可信输入未校验、危险 API。',
    '3. 可维护性：命名、职责划分、重复逻辑、过深嵌套。',
    '4. 性能：无谓的重复计算、N+1、不必要的同步阻塞。',
    '按「严重 / 建议 / 可选」三档给出问题，每条都要说明原因并给出可直接采用的修改方案。',
    '没有问题的维度直接跳过，不要为了凑数编造问题。',
  ].join('\n'),
};

const debugAssistant: SkillDefinition = {
  name: 'debug_assistant',
  label: '问题排查',
  description: '根据报错信息与现象定位根因并给出修复步骤',
  instructions: [
    '### 排查方法',
    '1. 先复述你对现象的理解，并指出最可能的根因（给出置信度高低）。',
    '2. 解释报错信息的含义，逐段拆解关键堆栈。',
    '3. 给出可执行的验证步骤，按「最快能排除最多可能性」排序。',
    '4. 最后给修复方案，并说明如何确认已修复。',
    '信息不足时，明确指出还需要哪些信息（日志、版本、复现步骤），不要凭空假设。',
  ].join('\n'),
};

const docWriter: SkillDefinition = {
  name: 'doc_writer',
  label: '文档撰写',
  description: '撰写结构化技术文档，如 README、API 文档、使用教程',
  instructions: [
    '### 文档撰写要求',
    '- 先确认文档类型与目标读者，再动笔。',
    '- 结构固定为：用途简介 → 快速开始 → 详细说明 → 常见问题。',
    '- 代码示例必须完整可运行，标注语言，不要写伪代码。',
    '- 参数、返回值用表格呈现；概念解释用短句，避免长段落堆砌。',
  ].join('\n'),
};

const dataAnalyst: SkillDefinition = {
  name: 'data_analyst',
  label: '数据分析',
  description: '对用户提供的数据做统计分析并给出结论与建议',
  instructions: [
    '### 数据分析方法',
    '1. 先明确分析目标与数据口径，指出数据本身的局限。',
    '2. 计算必要指标时使用 calculate 工具，不要心算，避免数字出错。',
    '3. 输出顺序：核心结论 → 关键指标 → 异常与归因 → 行动建议。',
    '4. 每个结论都要能追溯到具体数字；无法支撑的推测要明确标注为推测。',
  ].join('\n'),
  requiredTools: ['calculate'],
};

const decisionHelper: SkillDefinition = {
  name: 'decision_helper',
  label: '决策分析',
  description: '帮助用户在多个选项之间做结构化权衡',
  instructions: [
    '### 决策分析方法',
    '1. 先帮用户澄清真实目标与硬约束（不可妥协的条件）。',
    '2. 列出选项，按用户在意的维度逐项对比，标明各维度权重。',
    '3. 指出每个选项最大的风险与最坏情况。',
    '4. 给出明确倾向与理由，同时说明「什么情况下该换另一个选择」。',
    '不要替用户回避结论，也不要无视用户已明确的偏好。',
  ].join('\n'),
};

const teacher: SkillDefinition = {
  name: 'teacher',
  label: '讲解教学',
  description: '把复杂概念拆解成循序渐进、易于理解的讲解',
  instructions: [
    '### 教学方法',
    '1. 先用一个贴近生活的类比说明「它到底是什么、解决什么问题」。',
    '2. 再讲原理，从最小可理解单元开始，逐步加复杂度。',
    '3. 配一个最小可运行示例，并逐行解释关键处。',
    '4. 最后指出学习者最容易踩的坑，以及下一步该学什么。',
    '根据用户的表述判断其现有水平，不要讲得过浅或过深。',
  ].join('\n'),
};

const translator: SkillDefinition = {
  name: 'translator',
  label: '翻译润色',
  description: '进行高质量翻译与语言润色',
  instructions: [
    '### 翻译要求',
    '- 优先传达原意与语气，而非逐字对应；避免机翻腔。',
    '- 专业术语保留业内通用译法，必要时括注原文。',
    '- 用户未指定目标语言时，中文输入译英文，其他语言译中文。',
    '- 若原文有歧义，给出主要译法并简要说明其它可能。',
  ].join('\n'),
};

const researcher: SkillDefinition = {
  name: 'researcher',
  label: '资料研究',
  description: '基于知识库与网页资料做考证式回答',
  instructions: [
    '### 资料研究方法',
    '1. 先检索已挂载的知识库；用户给出链接时用 fetch_webpage 读取原文。',
    '2. 回答中明确区分「资料支持的事实」与「你的推断」。',
    '3. 引用资料时指出来源（文档名或网址）。',
    '4. 资料之间冲突时，把冲突点摆出来，不要擅自取其一当定论。',
  ].join('\n'),
  requiredTools: ['search_knowledge', 'fetch_webpage'],
};

export const SKILLS: SkillDefinition[] = [
  codeReview,
  debugAssistant,
  docWriter,
  dataAnalyst,
  decisionHelper,
  teacher,
  translator,
  researcher,
];
