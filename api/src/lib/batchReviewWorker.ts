import type {
  BatchReviewNotification,
  BatchReviewPageResult,
  BatchReviewTaskStatus,
} from '../../../shared/types.js';
import type { BatchReviewInput } from './batchVisionProvider.js';

export interface ClaimedBatchReviewTask extends BatchReviewInput {
  taskId: string;
  inviteCode: string;
  pageNos: number[];
}

export interface FinalizeBatchReviewTaskInput {
  taskId: string;
  status: Extract<BatchReviewTaskStatus, 'completed' | 'partial_failed' | 'failed'>;
  processedPages: number;
  succeededPages: number;
  failedPages: number;
  pendingPages: number;
  summary: unknown;
  lastErrorMessage?: string;
}

export interface SaveCompletedBatchReviewPageInput extends BatchReviewPageResult {
  taskId: string;
}

export interface SaveFailedBatchReviewPageInput {
  taskId: string;
  pageNo: number;
  errorMessage: string;
}

export interface CreateBatchReviewNotificationInput {
  inviteCode: string;
  taskId: string;
  type: BatchReviewNotification['type'];
  title: string;
  message: string;
}

export interface CreateBatchReviewTaskEventInput {
  taskId: string;
  eventType: string;
  payload: unknown;
}

export interface BatchReviewWorkerRepository {
  claimNextQueuedTask(workerId: string): Promise<ClaimedBatchReviewTask | null>;
  markTaskRunning(taskId: string, workerId: string): Promise<void>;
  markPageRunning(taskId: string, pageNo: number): Promise<void>;
  saveCompletedPage(input: SaveCompletedBatchReviewPageInput): Promise<void>;
  saveFailedPage(input: SaveFailedBatchReviewPageInput): Promise<void>;
  finalizeTask(input: FinalizeBatchReviewTaskInput): Promise<void>;
  createNotification(input: CreateBatchReviewNotificationInput): Promise<void>;
  createTaskEvent(input: CreateBatchReviewTaskEventInput): Promise<void>;
}

export interface BatchReviewWorker {
  runOnce(): Promise<boolean>;
  runForever(signal?: AbortSignal): Promise<void>;
}

export interface CreateBatchReviewWorkerOptions {
  workerId: string;
  repository: BatchReviewWorkerRepository;
  reviewBatchPages: (
    input: BatchReviewInput,
    options: { pageNos: number[] }
  ) => Promise<{
    summary: unknown;
    pages: BatchReviewPageResult[];
  }>;
  pollIntervalMs?: number;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return '批量批改失败，请稍后重试';
}

function buildNotification(status: FinalizeBatchReviewTaskInput['status']) {
  if (status === 'completed') {
    return {
      type: 'task_completed' as const,
      title: '批量批改已完成',
      message: '批量批改任务已完成，可查看全部结果。',
    };
  }

  if (status === 'partial_failed') {
    return {
      type: 'task_partial_failed' as const,
      title: '批量批改部分完成',
      message: '部分作业已批改完成，剩余失败页可新建重试任务。',
    };
  }

  return {
    type: 'task_failed' as const,
    title: '批量批改失败',
    message: '本次批量批改未完成，请稍后重试剩余部分。',
  };
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toTaskStatus(succeededPages: number, failedPages: number) {
  if (failedPages === 0) {
    return 'completed' as const;
  }

  if (succeededPages > 0) {
    return 'partial_failed' as const;
  }

  return 'failed' as const;
}

export function createBatchReviewWorker(
  options: CreateBatchReviewWorkerOptions
): BatchReviewWorker {
  async function runOnce() {
    const claimedTask = await options.repository.claimNextQueuedTask(options.workerId);

    if (!claimedTask) {
      return false;
    }

    await options.repository.markTaskRunning(claimedTask.taskId, options.workerId);
    await options.repository.createTaskEvent({
      taskId: claimedTask.taskId,
      eventType: 'task_claimed',
      payload: {
        workerId: options.workerId,
        pageNos: claimedTask.pageNos,
      },
    });

    let succeededPages = 0;
    let failedPages = 0;
    let lastErrorMessage: string | undefined;
    let latestSummary: unknown = {
      text: '等待处理',
    };

    for (const pageNo of claimedTask.pageNos) {
      await options.repository.markPageRunning(claimedTask.taskId, pageNo);

      try {
        const result = await options.reviewBatchPages(
          {
            answerPdfObjectKey: claimedTask.answerPdfObjectKey,
            rubricObjectKey: claimedTask.rubricObjectKey,
          },
          {
            pageNos: [pageNo],
          }
        );
        const [page] = result.pages;

        if (!page) {
          throw new Error(`批量批改未返回第 ${pageNo} 页结果`);
        }

        latestSummary = result.summary;
        succeededPages += 1;
        await options.repository.saveCompletedPage({
          taskId: claimedTask.taskId,
          ...page,
          pageNo,
        });
        await options.repository.createTaskEvent({
          taskId: claimedTask.taskId,
          eventType: 'page_completed',
          payload: {
            pageNo,
            score: page.score,
            level: page.level,
          },
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        lastErrorMessage = errorMessage;
        failedPages += 1;
        await options.repository.saveFailedPage({
          taskId: claimedTask.taskId,
          pageNo,
          errorMessage,
        });
        await options.repository.createTaskEvent({
          taskId: claimedTask.taskId,
          eventType: 'page_failed',
          payload: {
            pageNo,
            errorMessage,
          },
        });
      }
    }

    const processedPages = succeededPages + failedPages;
    const status = toTaskStatus(succeededPages, failedPages);
    await options.repository.finalizeTask({
      taskId: claimedTask.taskId,
      status,
      processedPages,
      succeededPages,
      failedPages,
      pendingPages: 0,
      summary: latestSummary,
      lastErrorMessage,
    });

    const notification = buildNotification(status);
    await options.repository.createNotification({
      inviteCode: claimedTask.inviteCode,
      taskId: claimedTask.taskId,
      ...notification,
    });
    await options.repository.createTaskEvent({
      taskId: claimedTask.taskId,
      eventType: 'task_finalized',
      payload: {
        status,
        processedPages,
        succeededPages,
        failedPages,
      },
    });

    return true;
  }

  return {
    runOnce,
    async runForever(signal) {
      while (!signal?.aborted) {
        const didWork = await runOnce();

        if (!didWork) {
          await delay(options.pollIntervalMs ?? 1000);
        }
      }
    },
  };
}
