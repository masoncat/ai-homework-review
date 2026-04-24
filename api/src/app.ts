import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { readConfig } from './config.js';
import { createBatchReviewTaskStore } from './lib/batchReviewTaskStore.js';
import { corsHeaders, withCors } from './lib/cors.js';
import { createObjectStoreFromConfig } from './lib/objectStore.js';
import { createMemoryRateLimitStore } from './lib/rateLimit.js';
import { readObjectStoreRuntimeContext } from './lib/runtimeContext.js';
import { createBatchReviewProvider } from './lib/batchVisionProvider.js';
import { createTeachingProvider } from './lib/teachingProvider.js';
import { createVisionProvider } from './lib/visionProvider.js';
import authRoute from './routes/auth.js';
import { createBatchReviewRoute } from './routes/batchReview.js';
import gradeRoute from './routes/grade.js';
import healthRoute from './routes/health.js';
import uploadsRoute from './routes/uploads.js';
import type { AppBindings } from './types.js';
import type { BatchReviewRepository } from './lib/batchReviewRepository.js';

interface CreateAppOptions {
  config?: ReturnType<typeof readConfig>;
  visionProvider?: AppBindings['Variables']['visionProvider'];
  teachingProvider?: AppBindings['Variables']['teachingProvider'];
  batchReviewProvider?: AppBindings['Variables']['batchReviewProvider'];
  batchReviewRepository?: AppBindings['Variables']['batchReviewRepository'];
  createBatchReviewTaskStore?: (
    objectStore: AppBindings['Variables']['objectStore']
  ) => AppBindings['Variables']['batchReviewTaskStore'];
  scheduleBatchReviewTask?: (
    taskId: string,
    run: () => Promise<void>
  ) => void;
  objectStore?: AppBindings['Variables']['objectStore'];
  rateLimitStore?: AppBindings['Variables']['rateLimitStore'];
}

function createLazyBatchReviewRepository(
  config: ReturnType<typeof readConfig>
): BatchReviewRepository {
  let repositoryPromise: Promise<BatchReviewRepository> | null = null;

  async function getRepository() {
    if (!config.mysqlUrl) {
      throw new Error('MYSQL_URL 尚未配置，无法启用离线批量任务');
    }

    if (!repositoryPromise) {
      repositoryPromise = Promise.all([
        import('./lib/batchReviewRepository.js'),
        import('./lib/batchReviewSql.js'),
        import('./lib/mysql.js'),
      ]).then(async ([repositoryModule, batchReviewSqlModule, mysqlModule]) => {
        const mysqlPool = mysqlModule.createMysqlPool(config.mysqlUrl);
        await batchReviewSqlModule.initializeBatchReviewSchema(mysqlPool);
        return repositoryModule.createBatchReviewRepository(mysqlPool);
      });
    }

    return repositoryPromise;
  }

  return {
    async createTask(input) {
      return (await getRepository()).createTask(input);
    },
    async listTaskSummaries(inviteCode, lookbackDays) {
      return (await getRepository()).listTaskSummaries(inviteCode, lookbackDays);
    },
    async getTaskDetail(taskId, inviteCode) {
      return (await getRepository()).getTaskDetail(taskId, inviteCode);
    },
    async createRetryChildTask(input) {
      return (await getRepository()).createRetryChildTask(input);
    },
    async listNotifications(inviteCode) {
      return (await getRepository()).listNotifications(inviteCode);
    },
    async markNotificationRead(notificationId, inviteCode) {
      return (await getRepository()).markNotificationRead(
        notificationId,
        inviteCode
      );
    },
    async claimNextQueuedTask(workerId) {
      return (await getRepository()).claimNextQueuedTask(workerId);
    },
    async markTaskRunning(taskId, workerId) {
      return (await getRepository()).markTaskRunning(taskId, workerId);
    },
    async markPageRunning(taskId, pageNo) {
      return (await getRepository()).markPageRunning(taskId, pageNo);
    },
    async saveCompletedPage(input) {
      return (await getRepository()).saveCompletedPage(input);
    },
    async saveFailedPage(input) {
      return (await getRepository()).saveFailedPage(input);
    },
    async finalizeTask(input) {
      return (await getRepository()).finalizeTask(input);
    },
    async createNotification(input) {
      return (await getRepository()).createNotification(input);
    },
    async createTaskEvent(input) {
      return (await getRepository()).createTaskEvent(input);
    },
  };
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
    options.batchReviewProvider ?? createBatchReviewProvider(config, objectStore);
  const batchReviewRepository =
    options.batchReviewRepository ??
    (config.batchReviewExecutionMode === 'offline'
      ? createLazyBatchReviewRepository(config)
      : null);
  const batchReviewTaskStore =
    options.createBatchReviewTaskStore?.(objectStore) ??
    createBatchReviewTaskStore(objectStore);
  const rateLimitStore =
    options.rateLimitStore ?? createMemoryRateLimitStore();

  app.use('*', async (c, next) => {
    c.set('config', config);
    c.set('visionProvider', visionProvider);
    c.set('teachingProvider', teachingProvider);
    c.set('batchReviewProvider', batchReviewProvider);
    c.set('batchReviewRepository', batchReviewRepository);
    c.set('batchReviewTaskStore', batchReviewTaskStore);
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
  app.route(
    '/batch-review',
    createBatchReviewRoute({
      scheduleBatchReviewTask: options.scheduleBatchReviewTask,
    })
  );
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
