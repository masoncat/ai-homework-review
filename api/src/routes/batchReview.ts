import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  buildBatchReviewResult,
  getPendingBatchReviewPageNos,
  mergeBatchReviewPages,
} from '../../../shared/batchReview.js';
import type {
  BatchReviewPageResult,
  BatchReviewTaskSnapshot,
} from '../../../shared/types.js';
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
const BATCH_REVIEW_POLL_PAGE_CHUNK_SIZE = 2;

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

function canPreparePollDrivenBatchReview(
  provider: AppBindings['Variables']['batchReviewProvider']
) {
  return (
    typeof provider.prepareBatchPages === 'function' &&
    typeof provider.reviewPreparedBatchPages === 'function'
  );
}

function canReviewPreparedBatchPages(
  provider: AppBindings['Variables']['batchReviewProvider']
) {
  return typeof provider.reviewPreparedBatchPages === 'function';
}

async function initializeBatchReviewTask(
  c: {
    get: <TKey extends keyof AppBindings['Variables']>(
      key: TKey
    ) => AppBindings['Variables'][TKey];
  },
  task: BatchReviewTaskSnapshot
) {
  const provider = c.get('batchReviewProvider');

  if (!canPreparePollDrivenBatchReview(provider)) {
    return task;
  }

  const runtime = c.get('objectStoreRuntimeContext') ?? undefined;
  const taskStore = c.get('batchReviewTaskStore');
  const prepareBatchPages = provider.prepareBatchPages;
  const preparedPages =
    task.preparedPages?.length && task.totalPages
      ? task.preparedPages
      : await prepareBatchPages!(
          {
            answerPdfObjectKey: task.answerPdfObjectKey,
            rubricObjectKey: task.rubricObjectKey,
          },
          {
            objectStoreRuntime: runtime,
          }
        );
  const totalPages = task.totalPages ?? preparedPages.length;
  const pendingPageNos = getPendingBatchReviewPageNos({
    ...task,
    totalPages,
  });
  const nextTask: BatchReviewTaskSnapshot = {
    ...task,
    status:
      pendingPageNos.length > 0
        ? 'processing'
        : task.status === 'failed'
          ? 'failed'
          : 'completed',
    totalPages,
    pendingPageNos: pendingPageNos.length > 0 ? pendingPageNos : undefined,
    preparedPages,
    updatedAt: nowIso(),
  };

  await taskStore.saveTask(nextTask, runtime);

  return nextTask;
}

async function processBatchReviewTask(
  c: {
    get: <TKey extends keyof AppBindings['Variables']>(
      key: TKey
    ) => AppBindings['Variables'][TKey];
  },
  taskId: string,
  options?: {
    pageNos?: number[];
  }
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

  const allPendingPageNos = uniqueSortedPageNos(
    currentTask.pendingPageNos ?? getPendingBatchReviewPageNos(currentTask)
  );
  const targetPageNos = uniqueSortedPageNos(
    options?.pageNos?.length ? options.pageNos : allPendingPageNos
  );
  const useLegacyWholeBatchRun =
    targetPageNos.length === 0 && !currentTask.preparedPages?.length;

  if (targetPageNos.length === 0 && !useLegacyWholeBatchRun) {
    return;
  }

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
    const provider = c.get('batchReviewProvider');
    const providerInput = {
      answerPdfObjectKey: currentTask.answerPdfObjectKey,
      rubricObjectKey: currentTask.rubricObjectKey,
    };
    const providerOptions = {
      objectStoreRuntime: runtime,
      pageNos: targetPageNos.length > 0 ? targetPageNos : undefined,
      onProgress: async (progress: {
        totalPages: number;
        processedPages: number;
        result?: { pages: BatchReviewPageResult[] };
      }) => {
        const resolvedTaskTotalPages =
          totalPages > 0 ? totalPages : progress.totalPages;
        const mergedPages = mergeBatchReviewPages(
          retainedPages,
          progress.result?.pages ?? []
        );
        const completedPageNos = new Set(
          (progress.result?.pages ?? []).map((page) => page.pageNo)
        );
        const remainingPageNos =
          allPendingPageNos.length > 0
            ? allPendingPageNos.filter((pageNo) => !completedPageNos.has(pageNo))
            : undefined;

        await taskStore.saveTask(
          {
            ...currentTask,
            status:
              remainingPageNos && remainingPageNos.length === 0
                ? 'completed'
                : 'processing',
            totalPages: resolvedTaskTotalPages,
            processedPages: mergedPages.length,
            pendingPageNos:
              remainingPageNos && remainingPageNos.length > 0
                ? remainingPageNos
                : undefined,
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
    };
    const providerResult =
      currentTask.preparedPages?.length &&
      provider.reviewPreparedBatchPages &&
      canReviewPreparedBatchPages(provider)
        ? await provider.reviewPreparedBatchPages(providerInput, {
            ...providerOptions,
            preparedPages: currentTask.preparedPages,
          })
        : await provider.reviewBatch(providerInput, providerOptions);
    const latestTask =
      (await taskStore.getTask(taskId, runtime)) ?? currentTask;
    const result = {
      ...providerResult,
      taskId: currentTask.taskId,
    };
    const mergedPages = mergeBatchReviewPages(
      latestTask.result?.pages ?? retainedPages,
      result.pages
    );
    const completedPageNos = new Set(result.pages.map((page) => page.pageNo));
    const remainingPageNos =
      allPendingPageNos.length > 0
        ? allPendingPageNos.filter((pageNo) => !completedPageNos.has(pageNo))
        : undefined;
    const nextStatus =
      remainingPageNos && remainingPageNos.length > 0
        ? 'processing'
        : 'completed';
    const resolvedProcessedPages =
      nextStatus === 'completed'
        ? Math.max(
            mergedPages.length,
            latestTask.processedPages,
            totalPages || result.totalPages || 0
          )
        : mergedPages.length;

    await taskStore.saveTask(
      {
        ...latestTask,
        status: nextStatus,
        totalPages: totalPages || result.totalPages || mergedPages.length,
        processedPages: resolvedProcessedPages,
        pendingPageNos:
          remainingPageNos && remainingPageNos.length > 0
            ? remainingPageNos
            : undefined,
        updatedAt: nowIso(),
        result: buildMergedTaskResult(
          currentTask,
          mergedPages,
          nextStatus === 'completed'
            ? totalPages || result.totalPages || mergedPages.length
            : mergedPages.length
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
            : allPendingPageNos.length > 0
              ? allPendingPageNos
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
    const taskStore = c.get('batchReviewTaskStore');

    await taskStore.saveTask(task, runtime);

    if (canPreparePollDrivenBatchReview(c.get('batchReviewProvider'))) {
      const initializedTask = await initializeBatchReviewTask(c, task);
      return c.json(initializedTask, 202);
    }

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

    const runtime = c.get('objectStoreRuntimeContext') ?? undefined;
    const taskStore = c.get('batchReviewTaskStore');
    let task = await taskStore.getTask(c.req.param('taskId'), runtime);

    if (!task) {
      throw new HTTPException(404, { message: '未找到批量批改任务' });
    }

    if (
      canReviewPreparedBatchPages(c.get('batchReviewProvider')) &&
      (task.status === 'queued' || task.status === 'processing')
    ) {
      task = await initializeBatchReviewTask(c, task);
      const pendingPageNos = getPendingBatchReviewPageNos(task);

      if (pendingPageNos.length > 0) {
        await processBatchReviewTask(c, task.taskId, {
          pageNos: pendingPageNos.slice(0, BATCH_REVIEW_POLL_PAGE_CHUNK_SIZE),
        });
        task = (await taskStore.getTask(task.taskId, runtime)) ?? task;
      }
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
      status: canReviewPreparedBatchPages(c.get('batchReviewProvider'))
        ? 'processing'
        : 'queued',
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

    if (!canReviewPreparedBatchPages(c.get('batchReviewProvider'))) {
      scheduleBatchReviewTask(task.taskId, async () => {
        await processBatchReviewTask(c, task.taskId);
      });
    }

    return c.json(nextTask, 202);
  });

  return batchReviewRoute;
}

export default createBatchReviewRoute();
