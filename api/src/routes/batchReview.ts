import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
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

  let session;
  try {
    session = await verifyToken(token, c.get('config'));
  } catch {
    throw new HTTPException(401, { message: '未登录或会话已失效' });
  }

  try {
    await assertRateLimit(
      c.get('rateLimitStore'),
      `batch-review:${session.inviteCode}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('请求过于频繁')) {
      throw new HTTPException(429, { message: error.message });
    }

    throw error;
  }

  const body = batchReviewBodySchema.parse(await c.req.json());
  const result = await c.get('batchReviewProvider').reviewBatch(body, {
    objectStoreRuntime: c.get('objectStoreRuntimeContext') ?? undefined,
  });

  return c.json(result);
});

export default batchReviewRoute;
