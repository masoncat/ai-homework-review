import { describe, expect, it, vi } from 'vitest';
import type { BatchReviewLevel, BatchReviewPageResult } from '../../../shared/types.js';
import { createBatchReviewWorker } from './batchReviewWorker.js';

function buildPageResult(): BatchReviewPageResult {
  return {
    pageNo: 1,
    displayName: '第 1 份',
    answerImageObjectKey: 'derived/page-1.png',
    answerImageUrl: 'https://oss.example.com/page-1.png',
    score: 8,
    level: '达到预期',
    summary: '完成',
    strengths: ['优点'],
    issues: ['问题'],
    suggestions: ['建议'],
  };
}

function buildSummary(level: BatchReviewLevel = '达到预期') {
  return {
    totalPages: 1,
    averageScore: 8,
    rows: [
      {
        pageNo: 1,
        displayName: '第 1 份',
        score: 8,
        level,
        summary: '完成',
      },
    ],
    levelCounts: {
      超出预期: 0,
      达到预期: level === '达到预期' ? 1 : 0,
      基本达到: 0,
      待提升: 0,
    },
  };
}

describe('createBatchReviewWorker', () => {
  it('claims one queued task and writes completed page results', async () => {
    const repo = {
      claimNextQueuedTask: vi.fn(async () => ({
        taskId: 'task-1',
        inviteCode: 'demo-code',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        pageNos: [1],
      })),
      markTaskRunning: vi.fn(async () => undefined),
      markPageRunning: vi.fn(async () => undefined),
      saveCompletedPage: vi.fn(async () => undefined),
      saveFailedPage: vi.fn(async () => undefined),
      finalizeTask: vi.fn(async () => undefined),
      createNotification: vi.fn(async () => undefined),
      createTaskEvent: vi.fn(async () => undefined),
    };
    const reviewBatchPages = vi.fn(
      async (): Promise<{ summary: unknown; pages: BatchReviewPageResult[] }> => ({
        summary: buildSummary(),
        pages: [buildPageResult()],
      })
    );

    const worker = createBatchReviewWorker({
      workerId: 'worker-1',
      repository: repo,
      reviewBatchPages,
    });

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(repo.claimNextQueuedTask).toHaveBeenCalledWith('worker-1');
    expect(repo.markTaskRunning).toHaveBeenCalledWith('task-1', 'worker-1');
    expect(repo.markPageRunning).toHaveBeenCalledWith('task-1', 1);
    expect(repo.saveCompletedPage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        pageNo: 1,
        score: 8,
      })
    );
    expect(repo.finalizeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        status: 'completed',
      })
    );
    expect(repo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteCode: 'demo-code',
        taskId: 'task-1',
        type: 'task_completed',
      })
    );
  });

  it('marks a task partial_failed when at least one page throws', async () => {
    const repo = {
      claimNextQueuedTask: vi.fn(async () => ({
        taskId: 'task-2',
        inviteCode: 'demo-code',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        pageNos: [1, 2],
      })),
      markTaskRunning: vi.fn(async () => undefined),
      markPageRunning: vi.fn(async () => undefined),
      saveCompletedPage: vi.fn(async () => undefined),
      saveFailedPage: vi.fn(async () => undefined),
      finalizeTask: vi.fn(async () => undefined),
      createNotification: vi.fn(async () => undefined),
      createTaskEvent: vi.fn(async () => undefined),
    };
    const reviewBatchPages = vi
      .fn<
        (input: unknown, options: { pageNos: number[] }) => Promise<{
          summary: unknown;
          pages: BatchReviewPageResult[];
        }>
      >()
      .mockResolvedValueOnce({
        summary: buildSummary(),
        pages: [buildPageResult()],
      })
      .mockRejectedValueOnce(new Error('model timeout'));

    const worker = createBatchReviewWorker({
      workerId: 'worker-1',
      repository: repo,
      reviewBatchPages,
    });

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(repo.saveCompletedPage).toHaveBeenCalledTimes(1);
    expect(repo.saveFailedPage).toHaveBeenCalledWith({
      taskId: 'task-2',
      pageNo: 2,
      errorMessage: 'model timeout',
    });
    expect(repo.finalizeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-2',
        status: 'partial_failed',
        succeededPages: 1,
        failedPages: 1,
      })
    );
    expect(repo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-2',
        type: 'task_partial_failed',
      })
    );
  });

  it('persists the claimed page number even when the scorer returns a mismatched pageNo', async () => {
    const repo = {
      claimNextQueuedTask: vi.fn(async () => ({
        taskId: 'task-3',
        inviteCode: 'demo-code',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        pageNos: [2],
      })),
      markTaskRunning: vi.fn(async () => undefined),
      markPageRunning: vi.fn(async () => undefined),
      saveCompletedPage: vi.fn(async () => undefined),
      saveFailedPage: vi.fn(async () => undefined),
      finalizeTask: vi.fn(async () => undefined),
      createNotification: vi.fn(async () => undefined),
      createTaskEvent: vi.fn(async () => undefined),
    };
    const reviewBatchPages = vi.fn(
      async (): Promise<{ summary: unknown; pages: BatchReviewPageResult[] }> => ({
        summary: buildSummary(),
        pages: [
          {
            ...buildPageResult(),
            pageNo: 999,
          },
        ],
      })
    );

    const worker = createBatchReviewWorker({
      workerId: 'worker-1',
      repository: repo,
      reviewBatchPages,
    });

    await worker.runOnce();

    expect(repo.saveCompletedPage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-3',
        pageNo: 2,
      })
    );
  });
});
