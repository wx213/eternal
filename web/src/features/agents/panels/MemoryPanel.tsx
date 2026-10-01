import { useCallback, useEffect, useState } from 'react';
import { agentsApi } from '../../../shared/api';

export interface MemoryPanelProps {
  agentId: string;
  /** 记忆按会话隔离，没有会话时无法查看 */
  conversationId: string | null;
}

/** 长期记忆：查看与清空 */
export default function MemoryPanel({ agentId, conversationId }: MemoryPanelProps) {
  const [memory, setMemory] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) {
      setLoading(false);
      return;
    }
    try {
      const result = await agentsApi.getMemory(agentId, conversationId);
      setMemory(result.memory);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [agentId, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = async () => {
    if (!conversationId || busy) return;
    if (!window.confirm('清空后助手将忘记这些长期信息，确定继续？')) return;

    setBusy(true);
    setError('');
    try {
      await agentsApi.clearMemory(agentId, conversationId);
      setMemory('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '清空失败');
    } finally {
      setBusy(false);
    }
  };

  if (!conversationId) {
    return <p className="panel-tip">还没有和这个智能体聊过天，聊几轮之后这里会出现它记住的信息。</p>;
  }

  return (
    <>
      {error && <div className="form-error">{error}</div>}

      <p className="panel-tip">
        助手会在多轮对话后自动提炼值得长期记住的信息（偏好、目标、重要背景），并在后续对话中参考。
      </p>

      <label>当前记忆</label>
      {loading ? (
        <p className="panel-tip">加载中…</p>
      ) : memory.trim() ? (
        <pre className="memory-box">{memory}</pre>
      ) : (
        <p className="panel-tip">暂无记忆内容。</p>
      )}

      <button className="btn-danger" onClick={() => void clear()} disabled={busy || !memory.trim()}>
        {busy ? '清空中…' : '清空记忆'}
      </button>
    </>
  );
}
