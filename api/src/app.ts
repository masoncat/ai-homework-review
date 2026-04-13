import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { readConfig } from './config.js';
import { corsHeaders, withCors } from './lib/cors.js';
import { createObjectStoreFromConfig } from './lib/objectStore.js';
import { createMemoryRateLimitStore } from './lib/rateLimit.js';
import { readObjectStoreRuntimeContext } from './lib/runtimeContext.js';
import { createTeachingProvider } from './lib/teachingProvider.js';
import { createVisionProvider } from './lib/visionProvider.js';
import authRoute from './routes/auth.js';
import batchReviewRoute from './routes/batchReview.js';
import gradeRoute from './routes/grade.js';
import healthRoute from './routes/health.js';
import uploadsRoute from './routes/uploads.js';
import type { AppBindings } from './types.js';

interface CreateAppOptions {
  config?: ReturnType<typeof readConfig>;
  visionProvider?: AppBindings['Variables']['visionProvider'];
  teachingProvider?: AppBindings['Variables']['teachingProvider'];
  batchReviewProvider?: AppBindings['Variables']['batchReviewProvider'];
  objectStore?: AppBindings['Variables']['objectStore'];
  rateLimitStore?: AppBindings['Variables']['rateLimitStore'];
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<AppBindings>();
  const config = options.config ?? readConfig();
  const objectStore = options.objectStore ?? createObjectStoreFromConfig(config);
  const visionProvider =
    options.visionProvider ?? createVisionProvider(config);
  const teachingProvider =
    options.teachingProvider ?? createTeachingProvider(config);
  const batchReviewProvider =
    options.batchReviewProvider ??
    ({
      async reviewBatch() {
        throw new HTTPException(503, {
          message: '批量批改能力尚未完成配置',
        });
      },
    } satisfies AppBindings['Variables']['batchReviewProvider']);
  const rateLimitStore =
    options.rateLimitStore ?? createMemoryRateLimitStore();

  app.use('*', async (c, next) => {
    c.set('config', config);
    c.set('visionProvider', visionProvider);
    c.set('teachingProvider', teachingProvider);
    c.set('batchReviewProvider', batchReviewProvider);
    c.set('objectStore', objectStore);
    c.set('objectStoreRuntimeContext', readObjectStoreRuntimeContext(c.req.raw));
    c.set('rateLimitStore', rateLimitStore);
    c.set('session', null);
    await next();
  });
  app.use('*', withCors);

  app.route('/auth', authRoute);
  app.route('/uploads', uploadsRoute);
  app.route('/grade', gradeRoute);
  app.route('/batch-review', batchReviewRoute);
  app.route('/health', healthRoute);
  app.options('*', (c) =>
    c.body(null, 204, corsHeaders(c.req.header('origin'), c.get('config')))
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ message: error.message }, error.status);
    }

    if (error instanceof Error) {
      return c.json({ message: error.message }, 400);
    }

    return c.json({ message: '服务异常' }, 500);
  });

  return app;
}

export const app = createApp();
