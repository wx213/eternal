/**
 * 知识检索工具
 *
 * 检索范围由 ToolContext.retriever 决定，而 retriever 由运行时按 agentId 装配，
 * 因此一个 Agent 永远只能检索到自己的知识库。
 */
import { z } from 'zod';
import { defineTool } from '../../core/agent.js';
import { env } from '../../config/env.js';

const schema = z.object({
  query: z.string().min(1).max(500).describe('检索关键词或问题，尽量具体'),
  topK: z.number().int().min(1).max(10).optional().describe('返回片段数量，默认 4'),
});

export const searchKnowledgeTool = defineTool({
  name: 'search_knowledge',
  label: '知识库检索',
  description: '在当前角色挂载的知识库中检索资料片段，用于回答需要依据文档的问题',
  guidance: '仅当问题依赖已上传的资料时使用；同一问题通常检索一次即可，拿到片段后直接作答。',
  schema,
  async execute(args, ctx) {
    if (!ctx.retriever) {
      return { ok: false, error: '当前角色还没有挂载知识库，请改用自身知识回答或提示用户上传资料。' };
    }

    const hits = await ctx.retriever.retrieve(args.query, args.topK ?? env.rag.topK);

    if (hits.length === 0) {
      return { ok: true, data: '知识库中没有找到相关内容。', summary: '未命中' };
    }

    return {
      ok: true,
      data: hits.map((hit, index) => ({
        index: index + 1,
        source: hit.source,
        score: Number(hit.score.toFixed(4)),
        content: hit.content,
      })),
      summary: `命中 ${hits.length} 个片段`,
    };
  },
});
