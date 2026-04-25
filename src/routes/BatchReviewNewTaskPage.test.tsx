import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from '../../shared/types';
import BatchReviewNewTaskPage from './BatchReviewNewTaskPage';

function buildSession(): SessionResponse {
  return {
    accessToken: 'token',
    expiresInSeconds: 7200,
  };
}

describe('BatchReviewNewTaskPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = '#/batch-review/new';
  });

  it('renders the wizard on a dedicated page without overview content', () => {
    render(
      <HashRouter>
        <BatchReviewNewTaskPage />
      </HashRouter>
    );

    expect(screen.getByRole('heading', { name: '新建批量任务' })).toBeInTheDocument();
    expect(screen.getByText('第 1 步')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '最近 7 天的批量任务' })
    ).not.toBeInTheDocument();
  });

  it('submits a new offline task and redirects to the task detail page', async () => {
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
      <HashRouter>
        <BatchReviewNewTaskPage
          requestSession={requestSession}
          requestUploadPolicy={requestUploadPolicy}
          uploadFile={uploadFile}
          submitBatchReview={submitBatchReview}
          loadDefaultBatchFiles={vi.fn().mockRejectedValue(new Error('skip fixtures'))}
        />
      </HashRouter>
    );

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

  it('keeps legacy inline result redirect compatibility', async () => {
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
      <HashRouter>
        <BatchReviewNewTaskPage
          requestSession={requestSession}
          requestUploadPolicy={requestUploadPolicy}
          uploadFile={uploadFile}
          submitBatchReview={submitBatchReview}
          loadDefaultBatchFiles={vi.fn().mockRejectedValue(new Error('skip fixtures'))}
        />
      </HashRouter>
    );

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
