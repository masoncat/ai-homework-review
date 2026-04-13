import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BatchReviewResult } from '../../shared/types';
import BatchReviewPage from './BatchReviewPage';

describe('BatchReviewPage', () => {
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
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
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
    } satisfies BatchReviewResult);

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
