import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  BatchReviewNotification,
  BatchReviewTaskSummary,
  SessionResponse,
} from '../../shared/types';
import BatchReviewPage from './BatchReviewPage';

function buildSession(): SessionResponse {
  return {
    accessToken: 'token',
    expiresInSeconds: 7200,
  };
}

function buildTaskSummary(): BatchReviewTaskSummary {
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
  };
}

function buildNotification(): BatchReviewNotification {
  return {
    id: 'notification-1',
    taskId: 'task-1',
    type: 'task_completed',
    title: '批改完成',
    message: '任务已完成',
    isRead: false,
    createdAt: '2026-04-25T01:00:00.000Z',
  };
}

describe('BatchReviewPage', () => {
  it('shows recent task summaries before the new task form', async () => {
    window.localStorage.setItem(
      'ai-homework-review:last-invite-code',
      'stored-code'
    );
    const requestSession = vi.fn(async () => buildSession());
    const listBatchReviewTasks = vi.fn(async () => [buildTaskSummary()]);
    const listBatchReviewNotifications = vi.fn(async () => [buildNotification()]);

    render(
      <BatchReviewPage
        requestSession={requestSession}
        listBatchReviewTasks={listBatchReviewTasks}
        listBatchReviewNotifications={listBatchReviewNotifications}
        loadDefaultBatchFiles={vi.fn().mockRejectedValue(new Error('skip fixtures'))}
      />
    );

    expect(
      (await screen.findAllByText('已完成 4/10 份')).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: '新建批量任务' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('任务已完成').length).toBeGreaterThan(0);
    expect(requestSession).toHaveBeenCalledWith({
      inviteCode: 'stored-code',
      humanToken: 'pass-human-check',
    });
  });

  it('opens the related task detail when a notification is clicked', async () => {
    const requestSession = vi.fn(async () => buildSession());
    const listBatchReviewTasks = vi.fn(async () => [buildTaskSummary()]);
    const listBatchReviewNotifications = vi.fn(async () => [buildNotification()]);

    render(
      <BatchReviewPage
        requestSession={requestSession}
        listBatchReviewTasks={listBatchReviewTasks}
        listBatchReviewNotifications={listBatchReviewNotifications}
        loadDefaultBatchFiles={vi.fn().mockRejectedValue(new Error('skip fixtures'))}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '批改完成' }));

    expect(window.location.hash).toBe('#/batch-review/tasks/task-1');
  });

  it('submits a new batch task and redirects to the offline task detail page', async () => {
    const requestSession = vi.fn(async () => buildSession());
    const requestUploadPolicy = vi
      .fn()
      .mockResolvedValueOnce({
        objectKey: 'uploads/answers.pdf',
        uploadUrl: 'https://oss.example.com',
        method: 'PUT',
        expiresInSeconds: 300,
        headers: {},
      })
      .mockResolvedValueOnce({
        objectKey: 'uploads/rubric.pdf',
        uploadUrl: 'https://oss.example.com',
        method: 'PUT',
        expiresInSeconds: 300,
        headers: {},
      });
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const submitBatchReview = vi.fn().mockResolvedValue({
      taskId: 'batch-1',
      status: 'queued',
      totalPages: 12,
      processedPages: 0,
      succeededPages: 0,
      failedPages: 0,
      summary: '等待处理',
      hasRetryablePages: true,
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    render(
      <BatchReviewPage
        requestSession={requestSession}
        requestUploadPolicy={requestUploadPolicy}
        uploadFile={uploadFile}
        submitBatchReview={submitBatchReview}
        listBatchReviewTasks={vi.fn(async () => [])}
        listBatchReviewNotifications={vi.fn(async () => [])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '新建批量任务' }));
    fireEvent.change(screen.getByPlaceholderText('输入体验码'), {
      target: { value: 'demo-code' },
    });
    fireEvent.change(screen.getByLabelText('班级答案 PDF'), {
      target: {
        files: [new File(['pdf'], 'answers.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.change(screen.getByLabelText('评分标准材料'), {
      target: {
        files: [new File(['rubric'], 'rubric.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '开始批量批改' }));

    await waitFor(() => expect(submitBatchReview).toHaveBeenCalled());
    expect(window.location.hash).toBe('#/batch-review/tasks/batch-1');
  });

  it('keeps the legacy inline result redirect when the backend still returns a snapshot task', async () => {
    const requestSession = vi.fn(async () => buildSession());
    const requestUploadPolicy = vi
      .fn()
      .mockResolvedValueOnce({
        objectKey: 'uploads/answers.pdf',
        uploadUrl: 'https://oss.example.com',
        method: 'PUT',
        expiresInSeconds: 300,
        headers: {},
      })
      .mockResolvedValueOnce({
        objectKey: 'uploads/rubric.pdf',
        uploadUrl: 'https://oss.example.com',
        method: 'PUT',
        expiresInSeconds: 300,
        headers: {},
      });
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const submitBatchReview = vi.fn().mockResolvedValue({
      taskId: 'legacy-task-1',
      status: 'queued',
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      processedPages: 0,
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    render(
      <BatchReviewPage
        requestSession={requestSession}
        requestUploadPolicy={requestUploadPolicy}
        uploadFile={uploadFile}
        submitBatchReview={submitBatchReview}
        listBatchReviewTasks={vi.fn(async () => [])}
        listBatchReviewNotifications={vi.fn(async () => [])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '新建批量任务' }));
    fireEvent.change(screen.getByPlaceholderText('输入体验码'), {
      target: { value: 'demo-code' },
    });
    fireEvent.change(screen.getByLabelText('班级答案 PDF'), {
      target: {
        files: [new File(['pdf'], 'answers.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.change(screen.getByLabelText('评分标准材料'), {
      target: {
        files: [new File(['rubric'], 'rubric.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '开始批量批改' }));

    await waitFor(() => expect(submitBatchReview).toHaveBeenCalled());
    expect(window.location.hash).toBe('#/batch-review/result/legacy-task-1');
  });
});
