import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  buildBatchReviewResult,
  getPendingBatchReviewPageNos,
  mergeBatchReviewPages,
} from '../../../shared/batchReview.js';
import type { BatchReviewPageResult, BatchReviewTaskSnapshot } from '../../../shared/types.js';
import { assertRateLimit } from '../lib/rateLimit.js';
import { verifyToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const batchReviewBodySchema = z.object({
  answerPdfObjectKey: z.string().trim().min(1),
  rubricObjectKey: z.string().trim().min(1),
});
const batchReviewRetryBodySchema = z.object({
  pageNos: z.array(z.number().int().positive()).optional(),
});

function nowIso() {
  return new Date().toISOString();
}

function defaultScheduleBatchReviewTask(
  _taskId: string,
  run: () => Promise<void>
) {
  setTimeout(() => {
    void run();
  }, 0);
}

function toTaskErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return '批量批改失败，请稍后重试';
}

function uniqueSortedPageNos(pageNos: number[]) {
  return [...new Set(pageNos)].sort((left, right) => left - right);
}

function buildAllPageNos(totalPages: number) {
  return Array.from({ length: totalPages }, (_, index) => index + 1);
}

function filterRetainedPages(
  resultPages: BatchReviewPageResult[] | undefined,
  retriedPageNos?: number[]
) {
  if (!resultPages?.length) {
    return [];
  }

  if (!retriedPageNos?.length) {
    return [];
  }

  const retriedSet = new Set(retriedPageNos);

  return resultPages.filter((page) => !retriedSet.has(page.pageNo));
}

function buildMergedTaskResult(
  task: Pick<BatchReviewTaskSnapshot, 'taskId' | 'answerPdfObjectKey' | 'rubricObjectKey'>,
  pages: BatchReviewPageResult[],
  totalPages?: number
) {
  return buildBatchReviewResult(
    {
      taskId: task.taskId,
      answerPdfObjectKey: task.answerPdfObjectKey,
      rubricObjectKey: task.rubricObjectKey,
    },
    pages,
    totalPages ?? pages.length
  );
}

function resolveRetryPageNos(task: BatchReviewTaskSnapshot, requestedPageNos?: number[]) {
  const normalizedRequested = uniqueSortedPageNos(requestedPageNos ?? []);
  const totalPages = task.totalPages ?? task.result?.totalPages ?? 0;

  if (normalizedRequested.length > 0) {
    return totalPages > 0
      ? normalizedRequested.filter((pageNo) => pageNo <= totalPages)
      : normalizedRequested;
  }

  const pendingPageNos = getPendingBatchReviewPageNos(task);

  if (pendingPageNos.length > 0) {
    return pendingPageNos;
  }

  if (totalPages > 0) {
    return buildAllPageNos(totalPages);
  }

  return undefined;
}

async function processBatchReviewTask(
  c: {
    get: <TKey extends keyof AppBindings['Variables']>(
      key: TKey
    ) => AppBindings['Variables'][TKey];
  },
  taskId: string
) {
  const runtime = c.get('objectStoreRuntimeContext') ?? undefined;
  const taskStore = c.get('batchReviewTaskStore');
  const currentTask = await taskStore.getTask(taskId, runtime);

  if (
    !currentTask ||
    currentTask.status === 'completed' ||
    currentTask.status === 'failed'
  ) {
    return;
  }

  const targetPageNos = uniqueSortedPageNos(currentTask.pendingPageNos ?? []);
  const retainedPages = filterRetainedPages(
    currentTask.result?.pages,
    targetPageNos.length > 0 ? targetPageNos : undefined
  );
  const totalPages =
    currentTask.totalPages ??
    currentTask.result?.totalPages ??
    retainedPages.length + targetPageNos.length;

  await taskStore.saveTask(
    {
      ...currentTask,
      status: 'processing',
      totalPages,
      processedPages: retainedPages.length,
      pendingPageNos: targetPageNos.length > 0 ? targetPageNos : undefined,
      updatedAt: nowIso(),
      errorMessage: undefined,
      result:
        retainedPages.length > 0
          ? buildMergedTaskResult(currentTask, retainedPages, retainedPages.length)
          : currentTask.result,
    },
    runtime
  );

  try {
    const providerResult = await c.get('batchReviewProvider').reviewBatch(
      {
        answerPdfObjectKey: currentTask.answerPdfObjectKey,
        rubricObjectKey: currentTask.rubricObjectKey,
      },
      {
        objectStoreRuntime: runtime,
        pageNos: targetPageNos.length > 0 ? targetPageNos : undefined,
        onProgress: async (progress) => {
          const resolvedTaskTotalPages =
            totalPages > 0 ? totalPages : progress.totalPages;
          const mergedPages = mergeBatchReviewPages(
            retainedPages,
            progress.result?.pages ?? []
          );
          const remainingPageNos =
            targetPageNos.length > 0
              ? targetPageNos.filter(
                  (pageNo) =>
                    !progress.result?.pages.some((page) => page.pageNo === pageNo)
                )
              : undefined;

          await taskStore.saveTask(
            {
              ...currentTask,
              status: 'processing',
              totalPages: resolvedTaskTotalPages,
              processedPages: mergedPages.length,
              pendingPageNos: remainingPageNos?.length ? remainingPageNos : undefined,
              updatedAt: nowIso(),
              errorMessage: undefined,
              result:
                mergedPages.length > 0
                  ? buildMergedTaskResult(
                      currentTask,
                      mergedPages,
                      mergedPages.length
                    )
                  : undefined,
            },
            runtime
          );
        },
      }
    );
    const result = {
      ...providerResult,
      taskId: currentTask.taskId,
    };
    const mergedPages = mergeBatchReviewPages(retainedPages, result.pages);
    const resolvedProcessedPages = Math.max(
      mergedPages.length,
      totalPages || result.totalPages || 0
    );

    await taskStore.saveTask(
      {
        ...currentTask,
        status: 'completed',
        totalPages: totalPages || result.totalPages || mergedPages.length,
        processedPages: resolvedProcessedPages,
        pendingPageNos: undefined,
        updatedAt: nowIso(),
        result: buildMergedTaskResult(
          currentTask,
          mergedPages,
          totalPages || result.totalPages || mergedPages.length
        ),
      },
      runtime
    );
  } catch (error) {
    const latestTask =
      (await taskStore.getTask(taskId, runtime)) ?? currentTask;

    await taskStore.saveTask(
      {
        ...latestTask,
        status: 'failed',
        totalPages: latestTask.totalPages ?? totalPages,
        processedPages:
          latestTask.result?.pages.length ?? latestTask.processedPages,
        pendingPageNos:
          latestTask.pendingPageNos?.length
            ? latestTask.pendingPageNos
            : targetPageNos.length > 0
              ? targetPageNos
              : undefined,
        updatedAt: nowIso(),
        errorMessage: toTaskErrorMessage(error),
      },
      runtime
    );
  }
}

export function createBatchReviewRoute(options: {
  scheduleBatchReviewTask?: (
    taskId: string,
    run: () => Promise<void>
  ) => void;
} = {}) {
  const batchReviewRoute = new Hono<AppBindings>();
  const scheduleBatchReviewTask =
    options.scheduleBatchReviewTask ?? defaultScheduleBatchReviewTask;

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

    if (
      !c.get('config').batchVisionAiApiKey ||
      !c.get('config').batchVisionAiModel
    ) {
      throw new HTTPException(503, {
        message: '批量批改能力尚未完成配置',
      });
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
    const task: BatchReviewTaskSnapshot = {
      taskId: crypto.randomUUID(),
      status: 'queued',
      answerPdfObjectKey: body.answerPdfObjectKey,
      rubricObjectKey: body.rubricObjectKey,
      processedPages: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const runtime = c.get('objectStoreRuntimeContext') ?? undefined;

    await c.get('batchReviewTaskStore').saveTask(task, runtime);

    scheduleBatchReviewTask(task.taskId, async () => {
      await processBatchReviewTask(c, task.taskId);
    });

    return c.json(task, 202);
  });

  batchReviewRoute.get('/:taskId', async (c) => {
    const authHeader = c.req.header('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return c.json({ message: '未登录或会话已失效' }, 401);
    }

    try {
      await verifyToken(token, c.get('config'));
    } catch {
      throw new HTTPException(401, { message: '未登录或会话已失效' });
    }

    const task = await c
      .get('batchReviewTaskStore')
      .getTask(
        c.req.param('taskId'),
        c.get('objectStoreRuntimeContext') ?? undefined
      );

    if (!task) {
      throw new HTTPException(404, { message: '未找到批量批改任务' });
    }

    return c.json(task);
  });

  batchReviewRoute.post('/:taskId/retry', async (c) => {
    const authHeader = c.req.header('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return c.json({ message: '未登录或会话已失效' }, 401);
    }

    try {
      await verifyToken(token, c.get('config'));
    } catch {
      throw new HTTPException(401, { message: '未登录或会话已失效' });
    }

    const runtime = c.get('objectStoreRuntimeContext') ?? undefined;
    const taskStore = c.get('batchReviewTaskStore');
    const task = await taskStore.getTask(c.req.param('taskId'), runtime);

    if (!task) {
      throw new HTTPException(404, { message: '未找到批量批改任务' });
    }

    const body = batchReviewRetryBodySchema.parse(await c.req.json());
    const retryPageNos = resolveRetryPageNos(task, body.pageNos);
    const retainedPages = filterRetainedPages(task.result?.pages, retryPageNos);
    const totalPages =
      task.totalPages ??
      task.result?.totalPages ??
      (retryPageNos?.length ?? 0) + retainedPages.length;
    const nextTask: BatchReviewTaskSnapshot = {
      ...task,
      status: 'queued',
      totalPages: totalPages || undefined,
      processedPages: retainedPages.length,
      pendingPageNos: retryPageNos,
      updatedAt: nowIso(),
      errorMessage: undefined,
      result:
        retainedPages.length > 0
          ? buildMergedTaskResult(task, retainedPages, retainedPages.length)
          : retryPageNos
            ? undefined
            : task.result,
    };

    await taskStore.saveTask(nextTask, runtime);

    scheduleBatchReviewTask(task.taskId, async () => {
      await processBatchReviewTask(c, task.taskId);
    });

    return c.json(nextTask, 202);
  });

  return batchReviewRoute;
}

export default createBatchReviewRoute();
