import { fireEvent, render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BatchReviewNotification,
  BatchReviewTaskSummary,
} from '../../shared/types';
import BatchReviewNotificationsPage from './BatchReviewNotificationsPage';

function buildTaskSummary(): BatchReviewTaskSummary {
  return {
    taskId: 'task-1',
    status: 'completed',
    totalPages: 1,
    processedPages: 1,
    succeededPages: 1,
    failedPages: 0,
    summary: '已完成',
    hasRetryablePages: false,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:10:00.000Z',
  };
}

function buildNotifications(): BatchReviewNotification[] {
  return [
    {
      id: 'notification-unread',
      taskId: 'task-1',
      type: 'task_partial_failed',
      title: '批改需要处理',
      message: '有 2 份作业需要重试',
      isRead: false,
      createdAt: '2026-04-25T01:00:00.000Z',
    },
    {
      id: 'notification-read',
      taskId: 'task-2',
      type: 'task_completed',
      title: '批改已完成',
      message: '点击查看作业点评',
      isRead: true,
      createdAt: '2026-04-24T23:00:00.000Z',
    },
  ];
}

describe('BatchReviewNotificationsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = '#/batch-review/notifications';
    window.localStorage.setItem(
      'ai-homework-review:last-invite-code',
      'stored-code'
    );
    window.sessionStorage.setItem(
      'ai-homework-review:batch-access-session',
      JSON.stringify({
        inviteCode: 'stored-code',
        accessToken: 'saved-token',
      })
    );
  });

  it('shows unread notifications before the collapsed read section', async () => {
    render(
      <HashRouter>
        <BatchReviewNotificationsPage
          listBatchReviewTasks={vi.fn(async () => [buildTaskSummary()])}
          listBatchReviewNotifications={vi.fn(async () => buildNotifications())}
        />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: '站内通知' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '未读通知' })).toBeInTheDocument();
    expect(screen.getByText('批改需要处理')).toBeInTheDocument();
    expect(screen.getByText('已读通知')).toBeInTheDocument();
    expect(screen.queryByText('批改已完成')).not.toBeInTheDocument();
  });

  it('opens task detail when the user taps a notification', async () => {
    render(
      <HashRouter>
        <BatchReviewNotificationsPage
          listBatchReviewTasks={vi.fn(async () => [buildTaskSummary()])}
          listBatchReviewNotifications={vi.fn(async () => buildNotifications())}
          markBatchReviewNotificationRead={vi.fn(async () => ({ ok: true }))}
        />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: '批改需要处理' }));

    expect(window.location.hash).toBe(
      '#/batch-review/tasks/task-1?from=notifications'
    );
  });
});
