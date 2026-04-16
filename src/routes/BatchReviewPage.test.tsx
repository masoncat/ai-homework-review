import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BatchReviewTaskSnapshot } from '../../shared/types';
import BatchReviewPage from './BatchReviewPage';

describe('BatchReviewPage', () => {
  it('prefills invite code from the last used value and loads local default files', async () => {
    window.localStorage.setItem('ai-homework-review:last-invite-code', 'stored-code');
    const loadDefaultBatchFiles = vi.fn().mockResolvedValue({
      inviteCode: 'demo-code',
      answerPdf: new File(['pdf'], '智能停车场+2-9+班.pdf', {
        type: 'application/pdf',
      }),
      rubricFile: new File(['rubric'], 'default.jpeg', {
        type: 'image/jpeg',
      }),
    });

    render(<BatchReviewPage loadDefaultBatchFiles={loadDefaultBatchFiles} />);

    await waitFor(() => {
      expect(screen.getByText('当前已选择：智能停车场+2-9+班.pdf')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('体验码')).toHaveValue('stored-code');
    expect(loadDefaultBatchFiles).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('当前已选择：default.jpeg')).toBeInTheDocument();
  });

  it('walks through the mobile wizard and submits a batch review task', async () => {
    const requestSession = vi.fn().mockResolvedValue({
      accessToken: 'token',
      expiresInSeconds: 7200,
    });
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
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      processedPages: 0,
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
    } satisfies BatchReviewTaskSnapshot);

    render(
      <BatchReviewPage
        requestSession={requestSession}
        requestUploadPolicy={requestUploadPolicy}
        uploadFile={uploadFile}
        submitBatchReview={submitBatchReview}
      />
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
    expect(window.location.hash).toBe('#/batch-review/result/batch-1');
  });
});
