/**
 * 把 Agent 记录装配成内核配置
 *
 * 这里是"用户在界面上的配置"到"内核可执行配置"的唯一翻译点。
 */
import { env } from '../config/env.js';
import { resolveCapabilities } from '../capabilities/registry.js';
import { buildPersonaInstructions } from '../modules/persona/prompt.js';
import type { AgentRecord } from '../modules/agents/types.js';
import type { AgentConfig } from '../core/types.js';

export function assembleAgentConfig(agent: AgentRecord, context: { hasKnowledgeBase: boolean }): AgentConfig {
  const capabilities = resolveCapabilities({
    toolNames: agent.tools,
    skillNames: agent.skills,
    hasKnowledgeBase: context.hasKnowledgeBase,
  });

  const baseInstructions =
    agent.type === 'persona'
      ? buildPersonaInstructions(agent.personaProfile, {
          name: agent.name,
          ...(agent.description ? { description: agent.description } : {}),
        })
      : buildFunctionalInstructions(agent);

  const instructions = [baseInstructions, capabilities.skillInstructions].filter((part) => part.trim()).join('\n\n');

  return {
    agentId: agent.id,
    ownerId: agent.ownerId,
    name: agent.name,
    instructions,
    ...(agent.model ? { model: agent.model } : {}),
    temperature: agent.temperature,
    maxIterations: env.agent.maxIterations,
    maxHistoryMessages: env.agent.maxHistoryMessages,
    contextStrategy: agent.contextStrategy,
    tools: capabilities.tools,
    // 挂了知识库就默认开启预检索：用户上传资料的意图就是希望被用上
    knowledgePrefetch: context.hasKnowledgeBase,
    memoryEnabled: env.memory.enabled,
  };
}

function buildFunctionalInstructions(agent: AgentRecord): string {
  if (agent.systemPrompt.trim()) return agent.systemPrompt.trim();

  const description = agent.description.trim() || '帮助用户解决问题';
  return `你是「${agent.name}」，${description}。`;
}
