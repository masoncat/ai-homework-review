import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { BatchReviewResult } from '../../shared/types';
import BatchReviewResultPage from './BatchReviewResultPage';

describe('BatchReviewResultPage', () => {
  it('renders the summary and per-page teacher comments', () => {
    const result: BatchReviewResult = {
      taskId: 'batch-1',
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      totalPages: 2,
      pages: [
        {
          pageNo: 1,
          displayName: '第 1 份',
          score: 8,
          level: '达到预期',
          summary: '图示完整，但说明不够清楚',
          strengths: ['列出了两种情况'],
          issues: ['关系说明不够完整'],
          suggestions: ['补充变化过程'],
        },
      ],
      summary: {
        totalPages: 2,
        averageScore: 7.5,
        rows: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            score: 8,
            level: '达到预期',
            summary: '图示完整，但说明不够清楚',
          },
        ],
        levelCounts: {
          超出预期: 0,
          达到预期: 1,
          基本达到: 1,
          待提升: 0,
        },
      },
    };

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-1']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={<BatchReviewResultPage loadResult={() => result} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('班级批量批改结果')).toBeInTheDocument();
    expect(screen.getAllByText('第 1 份')).toHaveLength(2);
    expect(screen.getAllByText('图示完整，但说明不够清楚')).toHaveLength(2);
    expect(screen.getByText('平均分 7.5')).toBeInTheDocument();
  });
});
