import type { ToolTraceView } from '../../shared/types';

/**
 * 工具调用过程可视化
 *
 * 原实现只显示工具的英文名，用户看到 "search_knowledge" 无从理解。
 * 现在展示后端给的中文 label、执行状态与耗时，失败原因通过 title 提示。
 */
export default function ToolTrace({ trace }: { trace: ToolTraceView[] }) {
  if (trace.length === 0) return null;

  return (
    <div className="trace-row">
      {trace.map((entry) => {
        const state = entry.running ? 'running' : entry.ok ? 'ok' : 'failed';
        const icon = entry.running ? '◌' : entry.ok ? '✓' : '✕';
        const duration = !entry.running && entry.durationMs > 0 ? ` · ${formatDuration(entry.durationMs)}` : '';

        return (
          <span key={entry.id} className={`trace-chip ${state}`} title={entry.summary}>
            <i className="tc-icon">{icon}</i>
            {entry.label}
            {duration}
          </span>
        );
      })}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
