import { Hono } from 'hono';
import { z } from 'zod';
import { parseAnswerKey } from '../../../shared/answerKey.js';
import { gradeSubmission } from '../../../shared/grading.js';
import { assertRateLimit } from '../lib/rateLimit.js';
import { verifyToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const gradeBodySchema = z.object({
  answerKey: z.string().trim().min(1),
  objectKey: z.string().trim().min(1),
});

const gradeRoute = new Hono<AppBindings>();

gradeRoute.post('/', async (c) => {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return c.json({ message: '未登录或会话已失效' }, 401);
  }

  const session = await verifyToken(token, c.get('config'));
  await assertRateLimit(c.get('rateLimitStore'), `grade:${session.inviteCode}`);

  const body = gradeBodySchema.parse(await c.req.json());
  const answerKey = parseAnswerKey(body.answerKey);
  const imageInput = await c
    .get('objectStore')
    .getObjectAiInput(
      body.objectKey,
      c.get('objectStoreRuntimeContext') ?? undefined
    );
  const recognized = await c
    .get('visionProvider')
    .recognize(imageInput, answerKey);
  const graded = gradeSubmission(answerKey, recognized);
  const teachingAdvice = await c
    .get('teachingProvider')
    .generateTeachingAdvice(graded);

  return c.json({
    taskId: crypto.randomUUID(),
    ...graded,
    teachingAdvice,
  });
});

export default gradeRoute;
