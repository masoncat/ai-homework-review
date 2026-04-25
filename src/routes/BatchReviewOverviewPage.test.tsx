import { fireEvent, render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BatchReviewNotification,
  BatchReviewTaskSummary,
} from '../../shared/types';
import BatchReviewOverviewPage from './BatchReviewOverviewPage';

function buildTaskSummary(
  overrides: Partial<BatchReviewTaskSummary>
): BatchReviewTaskSummary {
  return {
    taskId: 'task-1',
    status: 'running',
    totalPages: 10,
    processedPages: 4,
    succeededPages: 4,
    failedPages: 0,
    summary: '已完成 4/10 份',
    hasRetryablePages: false,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:10:00.000Z',
    ...overrides,
  };
}

function buildNotification(): BatchReviewNotification {
  return {
    id: 'notification-1',
    taskId: 'task-running',
    type: 'task_completed',
    title: '批改完成',
    message: '任务已完成',
    isRead: false,
    createdAt: '2026-04-25T01:00:00.000Z',
  };
}

describe('BatchReviewOverviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = '#/batch-review';
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

  it('shows summary cards before the filtered task list', async () => {
    const listBatchReviewTasks = vi.fn(async () => [
      buildTaskSummary({
        taskId: 'task-running',
        status: 'running',
        summary: '进行中任务',
      }),
      buildTaskSummary({
        taskId: 'task-failed',
        status: 'partial_failed',
        summary: '失败任务',
        failedPages: 2,
      }),
      buildTaskSummary({
        taskId: 'task-completed',
        status: 'completed',
        summary: '已完成任务',
      }),
    ]);
    const listBatchReviewNotifications = vi.fn(async () => [buildNotification()]);

    render(
      <HashRouter>
        <BatchReviewOverviewPage
          listBatchReviewTasks={listBatchReviewTasks}
          listBatchReviewNotifications={listBatchReviewNotifications}
        />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: '批量任务中心' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /最近 7 天/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近 7 天的批量任务' })).toBeInTheDocument();
    expect(screen.getByText('进行中任务')).toBeInTheDocument();
    expect(listBatchReviewTasks).toHaveBeenCalledWith('saved-token');
  });

  it('filters the task list when the user taps the failure summary card', async () => {
    const listBatchReviewTasks = vi.fn(async () => [
      buildTaskSummary({
        taskId: 'task-running',
        status: 'running',
        summary: '进行中任务',
      }),
      buildTaskSummary({
        taskId: 'task-failed',
        status: 'partial_failed',
        summary: '失败任务',
        failedPages: 2,
      }),
      buildTaskSummary({
        taskId: 'task-completed',
        status: 'completed',
        summary: '已完成任务',
      }),
    ]);

    render(
      <HashRouter>
        <BatchReviewOverviewPage
          listBatchReviewTasks={listBatchReviewTasks}
          listBatchReviewNotifications={vi.fn(async () => [])}
        />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /需处理/ }));

    expect(
      screen.getByRole('heading', { name: '待处理失败任务' })
    ).toBeInTheDocument();
    expect(screen.getByText('失败任务')).toBeInTheDocument();
    expect(screen.queryByText('进行中任务')).not.toBeInTheDocument();
    expect(screen.queryByText('已完成任务')).not.toBeInTheDocument();
  });
});
