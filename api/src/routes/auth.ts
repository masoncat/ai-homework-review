import { Hono } from 'hono';
import { z } from 'zod';
import { assertHumanToken } from '../lib/verifyHuman.js';
import { signToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const authBodySchema = z.object({
  inviteCode: z.string().trim().min(1),
  humanToken: z.string().trim().min(1),
});

const authRoute = new Hono<AppBindings>();

authRoute.post('/session', async (c) => {
  const body = authBodySchema.parse(await c.req.json());
  const config = c.get('config');

  await assertHumanToken(body.humanToken, config);

  if (!config.inviteCodes.includes(body.inviteCode)) {
    return c.json({ message: '体验码或人机验证无效' }, 401);
  }

  const accessToken = await signToken(
    { inviteCode: body.inviteCode },
    config
  );

  return c.json({
    accessToken,
    expiresInSeconds: 7200,
  });
});

export default authRoute;
