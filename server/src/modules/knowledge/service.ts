/**
 * 知识库领域服务：入库、列表、删除
 */
import { getLlmClient } from '../../core/llm.js';
import { AppError, toErrorMessage } from '../../shared/errors.js';
import { createLogger } from '../../shared/logger.js';
import * as repo from './repo.js';
import { invalidateRetriever } from './retriever.js';
import { splitText } from './textSplitter.js';

const log = createLogger('knowledge:service');

/** 单次 embedding 请求的批大小，过大容易触发服务商 429 */
const EMBED_BATCH = 16;
const MAX_TEXT_LENGTH = 300_000;
const MAX_CHUNKS = 2000;

export interface KnowledgeDocumentView {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  chunkCount: number;
  createdAt: number;
}

function toView(row: repo.KbDocumentRow): KnowledgeDocumentView {
  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
  };
}

export async function ingestDocument(input: {
  ownerId: string;
  agentId: string;
  filename: string;
  text: string;
}): Promise<{ document: KnowledgeDocumentView }> {
  const text = input.text.slice(0, MAX_TEXT_LENGTH);
  const chunks = splitText(text, { chunkSize: 1000, chunkOverlap: 150 });

  if (chunks.length === 0) {
    throw AppError.badRequest('文档内容为空或无法切分');
  }
  if (chunks.length > MAX_CHUNKS) {
    throw AppError.badRequest(`文档过大（切分出 ${chunks.length} 段，上限 ${MAX_CHUNKS} 段），请拆分后再上传`);
  }

  const document = repo.createDocument({
    agentId: input.agentId,
    ownerId: input.ownerId,
    filename: input.filename,
  });

  try {
    const llm = getLlmClient();
    const embedded: { content: string; embedding: number[] }[] = [];

    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) {
      const batch = chunks.slice(offset, offset + EMBED_BATCH);
      const vectors = await llm.embed(batch);
      batch.forEach((content, index) => {
        const embedding = vectors[index];
        if (embedding) embedded.push({ content, embedding });
      });
    }

    if (embedded.length === 0) {
      throw new Error('向量化结果为空');
    }

    repo.saveChunks({
      docId: document.id,
      agentId: input.agentId,
      source: input.filename,
      chunks: embedded,
    });
    invalidateRetriever(input.agentId);

    log.info('文档已入库', { agentId: input.agentId, filename: input.filename, chunks: embedded.length });

    return { document: toView(repo.getDocument(input.ownerId, input.agentId, document.id)!) };
  } catch (error) {
    const message = toErrorMessage(error);
    repo.markDocumentFailed(document.id, message);
    log.error('文档入库失败', { agentId: input.agentId, filename: input.filename, error });
    if (error instanceof AppError) throw error;
    throw AppError.upstream(`文档处理失败：${message}`, error);
  }
}

export function listAgentDocuments(ownerId: string, agentId: string) {
  const documents = repo.listDocuments(ownerId, agentId).map(toView);
  return {
    summary: {
      documentCount: documents.length,
      chunkCount: repo.countChunks(agentId),
    },
    documents,
  };
}

export function removeDocument(ownerId: string, agentId: string, docId: string): void {
  const ok = repo.deleteDocument(ownerId, agentId, docId);
  if (!ok) throw AppError.notFound('文档不存在');
  invalidateRetriever(agentId);
}

export function hasKnowledgeBase(agentId: string): boolean {
  return repo.countChunks(agentId) > 0;
}
