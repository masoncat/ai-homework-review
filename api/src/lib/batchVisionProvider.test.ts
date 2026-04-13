import { describe, expect, it, vi } from 'vitest';
import { createBatchReviewProvider } from './batchVisionProvider.js';

describe('createBatchReviewProvider', () => {
  it('scores each page and returns a batch result', async () => {
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        getObjectAiInput: vi
          .fn()
          .mockResolvedValueOnce('https://oss.example.com/rubric.pdf')
          .mockResolvedValueOnce('https://oss.example.com/page-1.png'),
      } as never,
      {
        extractPages: vi.fn(async () => [
          {
            pageNo: 1,
            objectKey: 'derived/page-1.png',
            contentType: 'image/png',
          },
        ]),
      },
      vi.fn(async () => ({
        score: 8,
        level: '达到预期',
        summary: '图示完整，但说明不够清楚',
        strengths: ['列出了两种情况'],
        issues: ['关系说明不够完整'],
        suggestions: ['补充变化过程'],
      }))
    );

    const result = await provider.reviewBatch({
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
    });

    expect(result.totalPages).toBe(1);
    expect(result.pages[0]?.displayName).toBe('第 1 份');
    expect(result.summary.rows).toHaveLength(1);
  });
});
