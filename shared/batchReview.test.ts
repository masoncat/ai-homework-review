import { describe, expect, it } from 'vitest';
import {
  buildBatchReviewSummary,
  normalizeBatchReviewLevel,
} from './batchReview';

describe('normalizeBatchReviewLevel', () => {
  it('maps arbitrary model labels into the supported level set', () => {
    expect(normalizeBatchReviewLevel('达到预期')).toBe('达到预期');
    expect(normalizeBatchReviewLevel('待改进')).toBe('待提升');
    expect(normalizeBatchReviewLevel('超出预期')).toBe('超出预期');
  });

  it('normalizes partial labels by keyword', () => {
    expect(normalizeBatchReviewLevel('整体基本达标')).toBe('基本达到');
  });
});

describe('buildBatchReviewSummary', () => {
  it('builds the class summary rows from page results', () => {
    const summary = buildBatchReviewSummary([
      {
        pageNo: 1,
        displayName: '第 1 份',
        score: 8,
        level: '达到预期',
        summary: '图示完整，但数量关系说明不够清楚',
        strengths: ['能列出两种情况'],
        issues: ['说明不够完整'],
        suggestions: ['补充变化过程'],
      },
    ]);

    expect(summary.rows).toEqual([
      {
        pageNo: 1,
        displayName: '第 1 份',
        score: 8,
        level: '达到预期',
        summary: '图示完整，但数量关系说明不够清楚',
      },
    ]);
    expect(summary.levelCounts['达到预期']).toBe(1);
  });
});
