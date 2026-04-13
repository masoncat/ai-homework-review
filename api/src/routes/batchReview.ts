import { Hono } from 'hono';
import { z } from 'zod';
import { assertRateLimit } from '../lib/rateLimit.js';
import { verifyToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const batchReviewBodySchema = z.object({
  answerPdfObjectKey: z.string().trim().min(1),
  rubricObjectKey: z.string().trim().min(1),
});

const batchReviewRoute = new Hono<AppBindings>();

batchReviewRoute.post('/', async (c) => {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return c.json({ message: '未登录或会话已失效' }, 401);
  }

  const session = await verifyToken(token, c.get('config'));
  await assertRateLimit(
    c.get('rateLimitStore'),
    `batch-review:${session.inviteCode}`
  );

  const body = batchReviewBodySchema.parse(await c.req.json());
  const result = await c.get('batchReviewProvider').reviewBatch(body, {
    objectStoreRuntime: c.get('objectStoreRuntimeContext') ?? undefined,
  });

  return c.json(result);
});

export default batchReviewRoute;
