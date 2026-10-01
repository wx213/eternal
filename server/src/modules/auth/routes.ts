import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authRequired, currentUser } from '../../http/middleware/auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import * as service from './service.js';

/** 认证类接口做限流，抵御撞库与注册滥用 */
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' } },
});

const registerSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(120),
  password: z.string().min(8, '密码至少 8 位').max(128),
  displayName: z.string().trim().min(1).max(40).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(120),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const result = await service.register(req.body as z.infer<typeof registerSchema>);
  res.status(201).json(result);
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const result = await service.login(req.body as z.infer<typeof loginSchema>);
  res.json(result);
});

authRouter.post('/refresh', authLimiter, validateBody(refreshSchema), (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  res.json(service.refresh(refreshToken));
});

authRouter.get('/me', authRequired, (req, res) => {
  res.json({ user: service.getProfile(currentUser(req).id) });
});
