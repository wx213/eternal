import { Router } from 'express';
import { z } from 'zod';
import { authRequired, currentUser } from '../../http/middleware/auth.js';
import { pathParam, validateBody } from '../../http/middleware/validate.js';
import { SseChannel } from '../../http/sse.js';
import { createLogger } from '../../shared/logger.js';
import { toErrorMessage } from '../../shared/errors.js';
import * as service from './service.js';

const log = createLogger('conversations:http');

const openSchema = z.object({ agentId: z.string().min(1).max(40) });
const sendSchema = z.object({ message: z.string().trim().min(1, '消息不能为空').max(8000) });
const pinSchema = z.object({ pinned: z.boolean() });

export const conversationsRouter = Router();
conversationsRouter.use(authRequired);

conversationsRouter.get('/', (req, res) => {
  res.json({ conversations: service.listConversations(currentUser(req).id) });
});

conversationsRouter.post('/open', validateBody(openSchema), (req, res) => {
  const { agentId } = req.body as z.infer<typeof openSchema>;
  res.json({ conversation: service.openConversation(currentUser(req).id, agentId) });
});

conversationsRouter.get('/:id/messages', (req, res) => {
  res.json({ messages: service.listMessages(currentUser(req).id, pathParam(req, 'id')) });
});

conversationsRouter.patch('/:id/pin', validateBody(pinSchema), (req, res) => {
  const { pinned } = req.body as z.infer<typeof pinSchema>;
  res.json({ conversation: service.setPinned(currentUser(req).id, pathParam(req, 'id'), pinned) });
});

/**
 * 发送消息（SSE 流式返回）
 *
 * 客户端断开时通过 AbortController 传导到内核，及时停止上游模型请求，不再白烧 token。
 */
conversationsRouter.post('/:id/messages', validateBody(sendSchema), async (req, res) => {
  const ownerId = currentUser(req).id;
  const conversationId = pathParam(req, 'id');
  const { message } = req.body as z.infer<typeof sendSchema>;

  // 先做一次归属校验，让「会话不存在」走标准 JSON 错误而不是 SSE 错误帧
  service.requireConversation(ownerId, conversationId);

  const channel = new SseChannel(res);
  const controller = new AbortController();

  const onClientGone = () => controller.abort('client.disconnect');
  res.on('close', onClientGone);

  try {
    await service.streamReply({
      ownerId,
      conversationId,
      message,
      signal: controller.signal,
      onEvent: (event) => channel.send(event),
    });
  } catch (error) {
    log.error('流式回复失败', { conversationId, error });
    channel.send({ type: 'error', code: 'INTERNAL_ERROR', message: toErrorMessage(error) });
  } finally {
    res.off('close', onClientGone);
    channel.close();
  }
});

conversationsRouter.post('/:id/abort', (req, res) => {
  const aborted = service.abortReply(currentUser(req).id, pathParam(req, 'id'));
  res.json({ ok: true, aborted });
});
