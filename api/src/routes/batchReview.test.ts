import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import type { BatchReviewProvider } from '../lib/batchVisionProvider.js';

describe('POST /batch-review', () => {
  it('returns 401 when the teacher session is missing', async () => {
    const app = createApp();
    const response = await app.request('http://local/batch-review', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('creates an async batch review task from uploaded files', async () => {
    const savedTasks = new Map<string, unknown>();
    const scheduleBatchReviewTask = vi.fn();
    const batchReviewProvider = {
      reviewBatch: vi.fn(async () => ({
        taskId: 'batch-task-1',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        totalPages: 2,
        pages: [],
        summary: {
          totalPages: 2,
          averageScore: 7.5,
          rows: [],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 1,
            待提升: 0,
          },
        },
      })),
    };

    const app = createApp({
      config: {
        ...readConfig(),
        batchVisionAiApiKey: 'test-key',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      batchReviewProvider,
      createBatchReviewTaskStore: () => ({
        async saveTask(task) {
          savedTasks.set(task.taskId, task);
        },
        async getTask(taskId) {
          return savedTasks.get(taskId) as never;
        },
      }),
      scheduleBatchReviewTask,
    });
    const response = await app.request('http://local/batch-review', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: 'queued',
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
    });
    expect(scheduleBatchReviewTask).toHaveBeenCalledTimes(1);
    expect(batchReviewProvider.reviewBatch).not.toHaveBeenCalled();
  });

  it('persists processing progress and partial results while the batch task is running', async () => {
    const savedTasks = new Map<string, Record<string, unknown>>();
    const savedSnapshots: Array<Record<string, unknown>> = [];
    let scheduledRun: (() => Promise<void>) | null = null;
    const batchReviewProvider = {
      reviewBatch: vi.fn(async (_input, options?: Record<string, unknown>) => {
        await (options?.onProgress as ((value: unknown) => Promise<void>))?.({
          totalPages: 2,
          processedPages: 1,
          result: {
            taskId: 'temp-task',
            answerPdfObjectKey: 'uploads/batch/answers.pdf',
            rubricObjectKey: 'uploads/batch/rubric.pdf',
            totalPages: 1,
            pages: [
              {
                pageNo: 1,
                displayName: '第 1 份',
                answerImageObjectKey: 'derived/page-1.png',
                answerImageUrl: 'https://oss.example.com/page-1.png',
                score: 8,
                level: '达到预期',
                summary: '第一页已完成',
                strengths: ['步骤比较完整'],
                issues: ['说明略少'],
                suggestions: ['补充文字说明'],
              },
            ],
            summary: {
              totalPages: 1,
              averageScore: 8,
              rows: [
                {
                  pageNo: 1,
                  displayName: '第 1 份',
                  score: 8,
                  level: '达到预期',
                  summary: '第一页已完成',
                },
              ],
              levelCounts: {
                超出预期: 0,
                达到预期: 1,
                基本达到: 0,
                待提升: 0,
              },
            },
          },
        });

        return {
          taskId: 'final-task',
          answerPdfObjectKey: 'uploads/batch/answers.pdf',
          rubricObjectKey: 'uploads/batch/rubric.pdf',
          totalPages: 2,
          pages: [],
          summary: {
            totalPages: 2,
            averageScore: 7.5,
            rows: [],
            levelCounts: {
              超出预期: 0,
              达到预期: 1,
              基本达到: 1,
              待提升: 0,
            },
          },
        };
      }),
    };

    const app = createApp({
      config: {
        ...readConfig(),
        batchVisionAiApiKey: 'test-key',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      batchReviewProvider,
      createBatchReviewTaskStore: () => ({
        async saveTask(task) {
          savedTasks.set(task.taskId, task as unknown as Record<string, unknown>);
          savedSnapshots.push(task as unknown as Record<string, unknown>);
        },
        async getTask(taskId) {
          return (savedTasks.get(taskId) as never) ?? null;
        },
      }),
      scheduleBatchReviewTask: (_taskId, run) => {
        scheduledRun = run;
      },
    });

    const response = await app.request('http://local/batch-review', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      }),
    });
    const task = (await response.json()) as { taskId: string };

    expect(scheduledRun).toBeTypeOf('function');
    await scheduledRun!();

    const processingSnapshot = savedSnapshots.find(
      (snapshot) =>
        snapshot.status === 'processing' && snapshot.processedPages === 1
    );

    expect(processingSnapshot).toMatchObject({
      taskId: task.taskId,
      totalPages: 2,
      processedPages: 1,
      result: {
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
          },
        ],
      },
    });
    expect(savedTasks.get(task.taskId)).toMatchObject({
      taskId: task.taskId,
      status: 'completed',
      totalPages: 2,
      processedPages: 2,
    });
  });

  it('keeps partial progress and surfaces the real error message when the batch task fails midway', async () => {
    const savedTasks = new Map<string, Record<string, unknown>>();
    let scheduledRun: (() => Promise<void>) | null = null;
    const batchReviewProvider = {
      reviewBatch: vi.fn(async (_input, options?: Record<string, unknown>) => {
        await (options?.onProgress as ((value: unknown) => Promise<void>))?.({
          totalPages: 3,
          processedPages: 1,
          result: {
            taskId: 'temp-task',
            answerPdfObjectKey: 'uploads/batch/answers.pdf',
            rubricObjectKey: 'uploads/batch/rubric.pdf',
            totalPages: 1,
            pages: [
              {
                pageNo: 1,
                displayName: '第 1 份',
                answerImageObjectKey: 'derived/page-1.png',
                answerImageUrl: 'https://oss.example.com/page-1.png',
                score: 8,
                level: '达到预期',
                summary: '第一页已完成',
                strengths: ['步骤比较完整'],
                issues: ['说明略少'],
                suggestions: ['补充文字说明'],
              },
            ],
            summary: {
              totalPages: 1,
              averageScore: 8,
              rows: [
                {
                  pageNo: 1,
                  displayName: '第 1 份',
                  score: 8,
                  level: '达到预期',
                  summary: '第一页已完成',
                },
              ],
              levelCounts: {
                超出预期: 0,
                达到预期: 1,
                基本达到: 0,
                待提升: 0,
              },
            },
          },
        });

        throw new Error(
          '调用批量批改多模态模型失败: HTTP 429 Too Many Requests - rate limit exceeded'
        );
      }),
    };

    const app = createApp({
      config: {
        ...readConfig(),
        batchVisionAiApiKey: 'test-key',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      batchReviewProvider,
      createBatchReviewTaskStore: () => ({
        async saveTask(task) {
          savedTasks.set(task.taskId, task as unknown as Record<string, unknown>);
        },
        async getTask(taskId) {
          return (savedTasks.get(taskId) as never) ?? null;
        },
      }),
      scheduleBatchReviewTask: (_taskId, run) => {
        scheduledRun = run;
      },
    });

    const response = await app.request('http://local/batch-review', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      }),
    });
    const task = (await response.json()) as { taskId: string };

    expect(scheduledRun).toBeTypeOf('function');
    await scheduledRun!();

    expect(savedTasks.get(task.taskId)).toMatchObject({
      taskId: task.taskId,
      status: 'failed',
      totalPages: 3,
      processedPages: 1,
      errorMessage:
        '调用批量批改多模态模型失败: HTTP 429 Too Many Requests - rate limit exceeded',
      result: {
        totalPages: 1,
        pages: [
          expect.objectContaining({
            pageNo: 1,
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
          }),
        ],
      },
    });
  });

  it('returns 503 until the real batch review provider is configured', async () => {
    const app = createApp();
    const response = await app.request('http://local/batch-review', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: '批量批改能力尚未完成配置',
    });
  });
});

describe('GET /batch-review/:taskId', () => {
  it('returns the saved batch review task snapshot', async () => {
    const task = {
      taskId: 'batch-task-1',
      status: 'completed' as const,
      totalPages: 1,
      processedPages: 1,
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:05:00.000Z',
      result: {
        taskId: 'batch-task-1',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        totalPages: 1,
        pages: [],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    };
    const app = createApp({
      createBatchReviewTaskStore: () => ({
        async saveTask() {},
        async getTask(taskId) {
          return taskId === 'batch-task-1' ? task : null;
        },
      }),
    });

    const response = await app.request('http://local/batch-review/batch-task-1', {
      method: 'GET',
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      taskId: 'batch-task-1',
      status: 'completed',
    });
  });
});

describe('POST /batch-review/:taskId/retry', () => {
  it('retries only the remaining unfinished pages and preserves completed results', async () => {
    const savedTasks = new Map<string, Record<string, unknown>>();
    let scheduledRun: (() => Promise<void>) | null = null;
    const existingTask = {
      taskId: 'batch-task-remaining',
      status: 'failed' as const,
      totalPages: 3,
      processedPages: 1,
      pendingPageNos: [2, 3],
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      createdAt: '2026-04-17T00:00:00.000Z',
      updatedAt: '2026-04-17T00:05:00.000Z',
      errorMessage: '网络波动',
      result: {
        taskId: 'batch-task-remaining',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
        ],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    };
    savedTasks.set(existingTask.taskId, existingTask as unknown as Record<string, unknown>);

    const batchReviewProvider: BatchReviewProvider = {
      reviewBatch: vi.fn(async (_input, options?: Record<string, unknown>) => {
        expect(options?.pageNos).toEqual([2, 3]);

        await (options?.onProgress as ((value: unknown) => Promise<void>))?.({
          totalPages: 2,
          processedPages: 1,
          result: {
            taskId: 'temp-task',
            answerPdfObjectKey: 'uploads/batch/answers.pdf',
            rubricObjectKey: 'uploads/batch/rubric.pdf',
            totalPages: 1,
            pages: [
              {
                pageNo: 2,
                displayName: '第 2 份',
                answerImageObjectKey: 'derived/page-2.png',
                answerImageUrl: 'https://oss.example.com/page-2.png',
                score: 6,
                level: '基本达到',
                summary: '第二页已完成',
                strengths: ['思路接近正确'],
                issues: ['计算有误'],
                suggestions: ['复核中间过程'],
              },
            ],
            summary: {
              totalPages: 1,
              averageScore: 6,
              rows: [
                {
                  pageNo: 2,
                  displayName: '第 2 份',
                  score: 6,
                  level: '基本达到',
                  summary: '第二页已完成',
                },
              ],
              levelCounts: {
                超出预期: 0,
                达到预期: 0,
                基本达到: 1,
                待提升: 0,
              },
            },
          },
        });

        return {
          taskId: 'retry-result',
          answerPdfObjectKey: 'uploads/batch/answers.pdf',
          rubricObjectKey: 'uploads/batch/rubric.pdf',
          totalPages: 2,
          pages: [
            {
              pageNo: 2,
              displayName: '第 2 份',
              answerImageObjectKey: 'derived/page-2.png',
              answerImageUrl: 'https://oss.example.com/page-2.png',
              score: 6,
              level: '基本达到',
              summary: '第二页已完成',
              strengths: ['思路接近正确'],
              issues: ['计算有误'],
              suggestions: ['复核中间过程'],
            },
            {
              pageNo: 3,
              displayName: '第 3 份',
              answerImageObjectKey: 'derived/page-3.png',
              answerImageUrl: 'https://oss.example.com/page-3.png',
              score: 9,
              level: '超出预期',
              summary: '第三页已完成',
              strengths: ['过程完整'],
              issues: ['无明显问题'],
              suggestions: ['保持'],
            },
          ],
          summary: {
            totalPages: 2,
            averageScore: 7.5,
            rows: [],
            levelCounts: {
              超出预期: 1,
              达到预期: 0,
              基本达到: 1,
              待提升: 0,
            },
          },
        };
      }) as unknown as BatchReviewProvider['reviewBatch'],
    };

    const app = createApp({
      config: {
        ...readConfig(),
        batchVisionAiApiKey: 'test-key',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      batchReviewProvider,
      createBatchReviewTaskStore: () => ({
        async saveTask(task) {
          savedTasks.set(task.taskId, task as unknown as Record<string, unknown>);
        },
        async getTask(taskId) {
          return (savedTasks.get(taskId) as never) ?? null;
        },
      }),
      scheduleBatchReviewTask: (_taskId, run) => {
        scheduledRun = run;
      },
    });

    const response = await app.request(
      'http://local/batch-review/batch-task-remaining/retry',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      taskId: 'batch-task-remaining',
      status: 'queued',
      processedPages: 1,
      pendingPageNos: [2, 3],
    });

    expect(scheduledRun).toBeTypeOf('function');
    await scheduledRun!();

    expect(savedTasks.get('batch-task-remaining')).toMatchObject({
      status: 'completed',
      processedPages: 3,
      pendingPageNos: undefined,
      result: {
        totalPages: 3,
        pages: [
          expect.objectContaining({ pageNo: 1 }),
          expect.objectContaining({ pageNo: 2 }),
          expect.objectContaining({ pageNo: 3 }),
        ],
      },
    });
  });

  it('retries only the selected pages and keeps other finished pages intact', async () => {
    const savedTasks = new Map<string, Record<string, unknown>>();
    let scheduledRun: (() => Promise<void>) | null = null;
    const existingTask = {
      taskId: 'batch-task-selected',
      status: 'failed' as const,
      totalPages: 3,
      processedPages: 3,
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      createdAt: '2026-04-17T00:00:00.000Z',
      updatedAt: '2026-04-17T00:05:00.000Z',
      errorMessage: '网络波动',
      result: {
        taskId: 'batch-task-selected',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        totalPages: 3,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
          {
            pageNo: 2,
            displayName: '第 2 份',
            answerImageObjectKey: 'derived/page-2.png',
            answerImageUrl: 'https://oss.example.com/page-2.png',
            score: 5,
            level: '待提升',
            summary: '第二页旧结果',
            strengths: ['列出已知条件'],
            issues: ['关键步骤缺失'],
            suggestions: ['补全推导过程'],
          },
          {
            pageNo: 3,
            displayName: '第 3 份',
            answerImageObjectKey: 'derived/page-3.png',
            answerImageUrl: 'https://oss.example.com/page-3.png',
            score: 9,
            level: '超出预期',
            summary: '第三页已完成',
            strengths: ['过程完整'],
            issues: ['无明显问题'],
            suggestions: ['保持'],
          },
        ],
        summary: {
          totalPages: 3,
          averageScore: 7.3,
          rows: [],
          levelCounts: {
            超出预期: 1,
            达到预期: 1,
            基本达到: 0,
            待提升: 1,
          },
        },
      },
    };
    savedTasks.set(existingTask.taskId, existingTask as unknown as Record<string, unknown>);

    const batchReviewProvider: BatchReviewProvider = {
      reviewBatch: vi.fn(async (_input, options?: Record<string, unknown>) => {
        expect(options?.pageNos).toEqual([2]);
        return {
          taskId: 'retry-result',
          answerPdfObjectKey: 'uploads/batch/answers.pdf',
          rubricObjectKey: 'uploads/batch/rubric.pdf',
          totalPages: 1,
          pages: [
            {
              pageNo: 2,
              displayName: '第 2 份',
              answerImageObjectKey: 'derived/page-2-v2.png',
              answerImageUrl: 'https://oss.example.com/page-2-v2.png',
              score: 7,
              level: '基本达到',
              summary: '第二页新结果',
              strengths: ['修正了思路'],
              issues: ['个别步骤可更完整'],
              suggestions: ['继续补充说明'],
            },
          ],
          summary: {
            totalPages: 1,
            averageScore: 7,
            rows: [],
            levelCounts: {
              超出预期: 0,
              达到预期: 0,
              基本达到: 1,
              待提升: 0,
            },
          },
        };
      }) as unknown as BatchReviewProvider['reviewBatch'],
    };

    const app = createApp({
      config: {
        ...readConfig(),
        batchVisionAiApiKey: 'test-key',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      batchReviewProvider,
      createBatchReviewTaskStore: () => ({
        async saveTask(task) {
          savedTasks.set(task.taskId, task as unknown as Record<string, unknown>);
        },
        async getTask(taskId) {
          return (savedTasks.get(taskId) as never) ?? null;
        },
      }),
      scheduleBatchReviewTask: (_taskId, run) => {
        scheduledRun = run;
      },
    });

    const response = await app.request(
      'http://local/batch-review/batch-task-selected/retry',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          pageNos: [2],
        }),
      }
    );

    expect(response.status).toBe(202);
    await response.json();
    expect(scheduledRun).toBeTypeOf('function');
    await scheduledRun!();

    expect(savedTasks.get('batch-task-selected')).toMatchObject({
      status: 'completed',
      pendingPageNos: undefined,
      result: {
        totalPages: 3,
        pages: [
          expect.objectContaining({
            pageNo: 1,
            answerImageObjectKey: 'derived/page-1.png',
          }),
          expect.objectContaining({
            pageNo: 2,
            answerImageObjectKey: 'derived/page-2-v2.png',
            summary: '第二页新结果',
          }),
          expect.objectContaining({
            pageNo: 3,
            answerImageObjectKey: 'derived/page-3.png',
          }),
        ],
      },
    });
  });
});
