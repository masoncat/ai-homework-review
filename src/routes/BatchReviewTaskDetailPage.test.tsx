import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { BatchReviewTaskDetail } from '../../shared/types';
import BatchReviewTaskDetailPage from './BatchReviewTaskDetailPage';

function buildDetail(): BatchReviewTaskDetail {
  return {
    taskId: 'task-1',
    inviteCode: 'demo-code',
    status: 'partial_failed',
    answerPdfObjectKey: 'uploads/batch/answers.pdf',
    rubricObjectKey: 'uploads/batch/rubric.pdf',
    totalPages: 2,
    processedPages: 2,
    succeededPages: 1,
    failedPages: 1,
    pendingPages: 0,
    summary: { text: '部分完成' },
    queuedAt: '2026-04-25T00:00:00.000Z',
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:10:00.000Z',
    pages: [
      {
        id: 'task-1:1',
        pageNo: 1,
        status: 'completed',
        score: 8,
        level: '达到预期',
        summary: '步骤清楚',
        result: {
          displayName: '第 1 份',
          strengths: ['优点 1'],
          issues: ['问题 1'],
          suggestions: ['建议 1'],
        },
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:05:00.000Z',
      },
      {
        id: 'task-1:2',
        pageNo: 2,
        status: 'failed',
        errorMessage: 'model timeout',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:06:00.000Z',
      },
    ],
  };
}

describe('BatchReviewTaskDetailPage', () => {
  it('loads one offline task detail and shows page-level feedback', async () => {
    const getBatchReviewTaskDetail = vi.fn(async () => buildDetail());

    render(
      <MemoryRouter initialEntries={['/batch-review/tasks/task-1']}>
        <Routes>
          <Route
            path="/batch-review/tasks/:taskId"
            element={
              <BatchReviewTaskDetailPage
                accessToken="token"
                getBatchReviewTaskDetail={getBatchReviewTaskDetail}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findAllByText((content) => content.includes('部分失败'))
    ).toHaveLength(2);
    expect(screen.getAllByText(/第 1 份/).length).toBeGreaterThan(0);
    expect(screen.getByText('优点 1')).toBeInTheDocument();
    expect(screen.getByText('问题 1')).toBeInTheDocument();
  });

  it('creates a retry child task from the detail page', async () => {
    const getBatchReviewTaskDetail = vi.fn(async () => buildDetail());
    const createBatchReviewRetryTask = vi.fn(async () => ({
      taskId: 'task-2',
      parentTaskId: 'task-1',
      status: 'queued',
      totalPages: 1,
      processedPages: 0,
      succeededPages: 0,
      failedPages: 0,
      summary: '等待处理',
      hasRetryablePages: true,
      createdAt: '2026-04-25T00:12:00.000Z',
      updatedAt: '2026-04-25T00:12:00.000Z',
    }));

    render(
      <MemoryRouter initialEntries={['/batch-review/tasks/task-1']}>
        <Routes>
          <Route
            path="/batch-review/tasks/:taskId"
            element={
              <BatchReviewTaskDetailPage
                accessToken="token"
                getBatchReviewTaskDetail={getBatchReviewTaskDetail}
                createBatchReviewRetryTask={createBatchReviewRetryTask}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: '重试剩余未完成部分' }));

    await waitFor(() =>
      expect(createBatchReviewRetryTask).toHaveBeenCalledWith('token', 'task-1')
    );
    expect(window.location.hash).toBe('#/batch-review/tasks/task-2');
  });
});
