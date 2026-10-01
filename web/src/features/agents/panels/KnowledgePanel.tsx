import { useCallback, useEffect, useState } from 'react';
import { IconUpload, IconTrash } from '../../../components/Icons';
import { agentsApi } from '../../../shared/api';
import { formatListTime } from '../../../shared/lib/format';
import type { KnowledgeDocument, KnowledgeSummary } from '../../../shared/types';

const ACCEPT = '.txt,.md,.markdown,.csv,.json,.log';
const MAX_FILE_SIZE = 2 * 1024 * 1024;

const STATUS_TEXT: Record<string, string> = {
  parsing: '解析中',
  ready: '已就绪',
  error: '失败',
};

export interface KnowledgePanelProps {
  agentId: string;
  /** 知识库变更后通知外层刷新 Agent（hasKnowledgeBase 会变） */
  onChanged: () => void;
}

/** 知识库管理：上传、查看、删除 */
export default function KnowledgePanel({ agentId, onChanged }: KnowledgePanelProps) {
  const [summary, setSummary] = useState<KnowledgeSummary>({ documentCount: 0, chunkCount: 0 });
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await agentsApi.listKnowledge(agentId);
      setSummary(result.summary);
      setDocuments(result.documents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterMutate = async () => {
    await load();
    onChanged();
  };

  const uploadFile = async (file: File | null) => {
    if (!file || busy) return;
    if (file.size > MAX_FILE_SIZE) {
      setError('文件超过 2MB，请拆分后再上传');
      return;
    }

    setError('');
    setBusy(true);
    try {
      await agentsApi.uploadKnowledgeFile(agentId, file);
      await afterMutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const uploadText = async () => {
    const content = text.trim();
    if (!content || busy) return;

    setError('');
    setBusy(true);
    try {
      await agentsApi.uploadKnowledgeText(agentId, title.trim() || '手动录入', content);
      setTitle('');
      setText('');
      await afterMutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (docId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await agentsApi.removeKnowledgeDocument(agentId, docId);
      await afterMutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <div className="form-error">{error}</div>}

      <p className="panel-tip">
        已挂载 {summary.documentCount} 个文档 / {summary.chunkCount} 个片段。
        挂载知识库后，助手每轮会自动检索相关内容作答。
      </p>

      <label>上传文档</label>
      <label className="upload-zone compact">
        <IconUpload size={20} />
        <span className="uz-text">{busy ? '处理中…' : '点击选择文件'}</span>
        <span className="uz-hint">支持 txt / md / csv / json / log，最大 2MB</span>
        <input
          type="file"
          accept={ACCEPT}
          disabled={busy}
          onChange={(event) => {
            void uploadFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </label>

      <label>或手动录入</label>
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="资料标题（可选）"
        disabled={busy}
      />
      <textarea
        rows={5}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="粘贴需要助手记住的资料内容…"
        disabled={busy}
      />
      <button className="btn-primary" onClick={() => void uploadText()} disabled={busy || !text.trim()}>
        保存为知识
      </button>

      <label style={{ marginTop: 14 }}>已有文档</label>
      {loading ? (
        <p className="panel-tip">加载中…</p>
      ) : documents.length === 0 ? (
        <p className="panel-tip">还没有文档。</p>
      ) : (
        <div className="doc-list">
          {documents.map((document) => (
            <div key={document.id} className="doc-item">
              <span className="doc-name" title={document.error ?? document.filename}>
                {document.filename}
              </span>
              <span className={`doc-status ${document.status}`}>
                {STATUS_TEXT[document.status] ?? document.status}
                {document.status === 'ready' && ` · ${document.chunkCount} 片段`}
              </span>
              <span className="doc-time">{formatListTime(document.createdAt)}</span>
              <button
                className="doc-del"
                onClick={() => void remove(document.id)}
                disabled={busy}
                title="删除"
                aria-label="删除文档"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
