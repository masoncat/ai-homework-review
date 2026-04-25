import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';

function createRepository() {
  return {
    createTask: vi.fn(async () => undefined),
    listTaskSummaries: vi.fn(async () => [
      {
        taskId: 'task-1',
        status: 'queued',
        totalPages: 3,
        processedPages: 0,
        succeededPages: 0,
        failedPages: 0,
        summary: '等待处理',
        hasRetryablePages: true,
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]),
    getTaskDetail: vi.fn(async () => ({
      taskId: 'task-1',
      inviteCode: 'demo-code',
      status: 'queued',
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      totalPages: 3,
      processedPages: 0,
      succeededPages: 0,
      failedPages: 0,
      pendingPages: 3,
      summary: { text: '等待处理' },
      queuedAt: '2026-04-25T00:00:00.000Z',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
      pages: [],
    })),
    createRetryChildTask: vi.fn(async () => undefined),
    listNotifications: vi.fn(async () => []),
    markNotificationRead: vi.fn(async () => true),
  };
}

describe('offline batch review task routes', () => {
  it('creates a queued offline task when execution mode is offline', async () => {
    const repository = createRepository();
    const batchReviewProvider = {
      countBatchPages: vi.fn(async () => 2),
      reviewBatch: vi.fn(),
    };

    const app = createApp({
      config: {
        ...readConfig(),
        batchReviewExecutionMode: 'offline',
        batchVisionAiApiKey: 'test-key',
        batchVisionAiModel: 'gpt-5.5',
      },
      batchReviewProvider: batchReviewProvider as never,
      batchReviewRepository: repository as never,
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
    expect(batchReviewProvider.countBatchPages).toHaveBeenCalledTimes(1);
    expect(repository.createTask).toHaveBeenCalledTimes(1);
    expect(repository.createTask).toHaveBeenCalledWith({
      taskId: expect.any(String),
      inviteCode: 'demo-code',
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      pageNos: [1, 2],
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'queued',
      totalPages: 2,
      processedPages: 0,
      succeededPages: 0,
      failedPages: 0,
    });
  });

  it('lists recent task summaries for the invite-code session', async () => {
    const repository = createRepository();
    const app = createApp({
      config: {
        ...readConfig(),
        batchReviewExecutionMode: 'offline',
      },
      batchReviewRepository: repository as never,
    });

    const response = await app.request('http://local/batch-review/tasks', {
      method: 'GET',
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(repository.listTaskSummaries).toHaveBeenCalledWith('demo-code', 7);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        taskId: 'task-1',
        status: 'queued',
      }),
    ]);
  });

  it('returns one task detail in offline mode', async () => {
    const repository = createRepository();
    const app = createApp({
      config: {
        ...readConfig(),
        batchReviewExecutionMode: 'offline',
      },
      batchReviewRepository: repository as never,
    });

    const response = await app.request('http://local/batch-review/tasks/task-1', {
      method: 'GET',
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(repository.getTaskDetail).toHaveBeenCalledWith('task-1', 'demo-code');
    await expect(response.json()).resolves.toMatchObject({
      taskId: 'task-1',
      status: 'queued',
    });
  });

  it('creates a retry child task for an offline task', async () => {
    const repository = createRepository();
    const app = createApp({
      config: {
        ...readConfig(),
        batchReviewExecutionMode: 'offline',
      },
      batchReviewRepository: repository as never,
    });

    const response = await app.request(
      'http://local/batch-review/tasks/task-1/retry',
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
    expect(repository.createRetryChildTask).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      status: 'queued',
      parentTaskId: 'task-1',
    });
  });
});
