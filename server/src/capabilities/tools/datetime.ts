/**
 * 时间工具
 *
 * 模型没有实时时钟，涉及"今天/现在/还有几天"的问题必须靠工具取真实时间。
 */
import { z } from 'zod';
import { defineTool } from '../../core/agent.js';

const schema = z.object({
  timeZone: z
    .string()
    .max(60)
    .optional()
    .describe('IANA 时区名，如 Asia/Shanghai；默认使用服务器时区'),
});

export const currentDatetimeTool = defineTool({
  name: 'current_datetime',
  label: '当前时间',
  description: '获取当前的日期、时间与星期',
  guidance: '涉及“今天/现在/明天/还有几天”等与当下时间相关的问题时先调用它，不要凭空推测日期。',
  schema,
  async execute(args) {
    const now = new Date();
    const timeZone = args.timeZone?.trim();

    try {
      const formatter = new Intl.DateTimeFormat('zh-CN', {
        ...(timeZone ? { timeZone } : {}),
        dateStyle: 'full',
        timeStyle: 'medium',
      });

      return {
        ok: true,
        data: {
          iso: now.toISOString(),
          local: formatter.format(now),
          timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          timestamp: now.getTime(),
        },
        summary: formatter.format(now),
      };
    } catch {
      return { ok: false, error: `无法识别的时区「${timeZone}」，请使用 Asia/Shanghai 这类 IANA 时区名。` };
    }
  },
});
