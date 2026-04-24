import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';

function createRepository() {
  return {
    createTask: vi.fn(async () => undefined),
    listTaskSummaries: vi.fn(async () => []),
    getTaskDetail: vi.fn(async () => null),
    createRetryChildTask: vi.fn(async () => undefined),
    listNotifications: vi.fn(async () => [
      {
        id: 'notification-1',
        taskId: 'task-1',
        type: 'task_completed',
        title: '批改完成',
        message: '任务已完成',
        isRead: false,
        createdAt: '2026-04-25T01:00:00.000Z',
      },
    ]),
    markNotificationRead: vi.fn(async () => true),
  };
}

describe('offline batch review notifications routes', () => {
  it('lists notifications for the invite-code session', async () => {
    const repository = createRepository();
    const app = createApp({
      config: {
        ...readConfig(),
        batchReviewExecutionMode: 'offline',
      },
      batchReviewRepository: repository as never,
    });

    const response = await app.request('http://local/batch-review/notifications', {
      method: 'GET',
      headers: {
        authorization: 'Bearer demo-token',
      },
    });

    expect(response.status).toBe(200);
    expect(repository.listNotifications).toHaveBeenCalledWith('demo-code');
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'notification-1',
        taskId: 'task-1',
      }),
    ]);
  });

  it('marks one notification as read', async () => {
    const repository = createRepository();
    const app = createApp({
      config: {
        ...readConfig(),
        batchReviewExecutionMode: 'offline',
      },
      batchReviewRepository: repository as never,
    });

    const response = await app.request(
      'http://local/batch-review/notifications/notification-1/read',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(repository.markNotificationRead).toHaveBeenCalledWith(
      'notification-1',
      'demo-code'
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
