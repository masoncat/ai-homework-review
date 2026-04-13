import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

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

  it('creates a batch review result from uploaded files', async () => {
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

    const app = createApp({ batchReviewProvider });
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

    expect(response.status).toBe(200);
    expect(batchReviewProvider.reviewBatch).toHaveBeenCalledWith(
      {
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      },
      { objectStoreRuntime: undefined }
    );
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
