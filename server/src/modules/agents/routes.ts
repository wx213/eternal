import { Router } from 'express';
import type { z } from 'zod';
import { getCapabilityCatalog } from '../../capabilities/registry.js';
import { authRequired, currentUser } from '../../http/middleware/auth.js';
import { decodeTextFile, sanitizeFilename, textUpload } from '../../http/middleware/upload.js';
import { pathParam, validateBody, validateQuery } from '../../http/middleware/validate.js';
import { AppError } from '../../shared/errors.js';
import * as service from './service.js';
import {
  conversationScopedQuerySchema,
  corpusBodySchema,
  createAgentSchema,
  extractPersonaSchema,
  knowledgeTextSchema,
  updateAgentSchema,
} from './schema.js';

export const agentsRouter = Router();
agentsRouter.use(authRequired);

// 能力清单（静态，放在 /:id 之前避免被参数路由吞掉）
agentsRouter.get('/capabilities', (_req, res) => {
  res.json(getCapabilityCatalog());
});

agentsRouter.get('/', (req, res) => {
  res.json({ agents: service.listAgents(currentUser(req).id) });
});

agentsRouter.post('/', validateBody(createAgentSchema), (req, res) => {
  const input = req.body as z.infer<typeof createAgentSchema>;
  res.status(201).json({ agent: service.createAgent(currentUser(req).id, input) });
});

agentsRouter.get('/:id', (req, res) => {
  res.json({ agent: service.getAgent(currentUser(req).id, pathParam(req, 'id')) });
});

agentsRouter.patch('/:id', validateBody(updateAgentSchema), (req, res) => {
  const patch = req.body as z.infer<typeof updateAgentSchema>;
  res.json({ agent: service.updateAgent(currentUser(req).id, pathParam(req, 'id'), patch) });
});

agentsRouter.delete('/:id', (req, res) => {
  service.deleteAgent(currentUser(req).id, pathParam(req, 'id'));
  res.json({ ok: true });
});

// ========== 拟真人格语料 ==========

agentsRouter.post('/:id/corpora', textUpload.single('file'), validateBody(corpusBodySchema), (req, res) => {
  const ownerId = currentUser(req).id;
  const body = req.body as z.infer<typeof corpusBodySchema>;

  const payload = req.file
    ? {
        sourceType: 'chatlog_file' as const,
        filename: sanitizeFilename(req.file.originalname),
        content: decodeTextFile(req.file.buffer),
      }
    : body.profileText
      ? { sourceType: 'profile_text' as const, filename: null, content: body.profileText }
      : null;

  if (!payload) throw AppError.badRequest('请上传语料文件或提供 profileText');

  res.status(201).json({ corpus: service.addCorpus(ownerId, pathParam(req, 'id'), payload) });
});

agentsRouter.get('/:id/corpora', (req, res) => {
  res.json({ corpora: service.listCorpora(currentUser(req).id, pathParam(req, 'id')) });
});

agentsRouter.post('/:id/persona/extract', validateBody(extractPersonaSchema), async (req, res) => {
  const { speaker } = req.body as z.infer<typeof extractPersonaSchema>;
  res.json(await service.extractPersona(currentUser(req).id, pathParam(req, 'id'), speaker));
});

// ========== 知识库 ==========

agentsRouter.post(
  '/:id/knowledge/documents',
  textUpload.single('file'),
  validateBody(knowledgeTextSchema),
  async (req, res) => {
    const ownerId = currentUser(req).id;
    const body = req.body as z.infer<typeof knowledgeTextSchema>;

    const payload = req.file
      ? { filename: sanitizeFilename(req.file.originalname), text: decodeTextFile(req.file.buffer) }
      : body.text
        ? { filename: sanitizeFilename(body.title ?? '手动录入', '手动录入'), text: body.text }
        : null;

    if (!payload) throw AppError.badRequest('请上传文档文件或提供 text');

    res.status(201).json(await service.addKnowledgeDocument(ownerId, pathParam(req, 'id'), payload));
  },
);

agentsRouter.get('/:id/knowledge/documents', (req, res) => {
  res.json(service.listKnowledgeDocuments(currentUser(req).id, pathParam(req, 'id')));
});

agentsRouter.delete('/:id/knowledge/documents/:docId', (req, res) => {
  service.deleteKnowledgeDocument(currentUser(req).id, pathParam(req, 'id'), pathParam(req, 'docId'));
  res.json({ ok: true });
});

// ========== 长期记忆（按会话隔离） ==========

agentsRouter.get('/:id/memory', validateQuery(conversationScopedQuerySchema), async (req, res) => {
  const { conversationId } = req.query as z.infer<typeof conversationScopedQuerySchema>;
  res.json({ memory: await service.readMemory(currentUser(req).id, pathParam(req, 'id'), conversationId) });
});

agentsRouter.delete('/:id/memory', validateQuery(conversationScopedQuerySchema), async (req, res) => {
  const { conversationId } = req.query as z.infer<typeof conversationScopedQuerySchema>;
  await service.clearMemory(currentUser(req).id, pathParam(req, 'id'), conversationId);
  res.json({ ok: true });
});
