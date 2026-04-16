import { describe, expect, it } from 'vitest';
import type { BatchReviewPageResult } from './types';
import {
  buildBatchReviewSummary,
  normalizeBatchReviewLevel,
  normalizeBatchReviewScore,
} from './batchReview';

describe('normalizeBatchReviewLevel', () => {
  it('maps arbitrary model labels into the supported level set', () => {
    expect(normalizeBatchReviewLevel('达到预期')).toBe('达到预期');
    expect(normalizeBatchReviewLevel('基本达到')).toBe('基本达到');
    expect(normalizeBatchReviewLevel('待改进')).toBe('待提升');
    expect(normalizeBatchReviewLevel('未达到预期')).toBe('待提升');
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
        answerImageObjectKey: 'derived/page-1.png',
        answerImageUrl: 'https://oss.example.com/page-1.png',
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

  it('counts normalized levels without misclassifying 基本达到', () => {
    const summary = buildBatchReviewSummary([
      {
        pageNo: 2,
        displayName: '第 2 份',
        answerImageObjectKey: 'derived/page-2.png',
        answerImageUrl: 'https://oss.example.com/page-2.png',
        score: 7,
        level: '基本达到',
        summary: '解题方向正确，但步骤略有跳跃',
        strengths: ['能找出关键信息'],
        issues: ['步骤不够完整'],
        suggestions: ['补全中间推导'],
      },
    ]);

    expect(summary.levelCounts['基本达到']).toBe(1);
    expect(summary.levelCounts['达到预期']).toBe(0);
  });

  it('normalizes row levels and preserves summary contract defaults', () => {
    const summary = buildBatchReviewSummary([
      {
        pageNo: 3,
        displayName: '第 3 份',
        answerImageObjectKey: 'derived/page-3.png',
        answerImageUrl: 'https://oss.example.com/page-3.png',
        score: 7,
        level: '待提升',
        summary: '需要补充关键步骤',
        strengths: ['知道题意'],
        issues: ['推导不完整'],
        suggestions: ['补充中间过程'],
      },
      {
        pageNo: 4,
        displayName: '第 4 份',
        answerImageObjectKey: 'derived/page-4.png',
        answerImageUrl: 'https://oss.example.com/page-4.png',
        score: 8,
        level: '整体基本达标' as never,
        summary: '整体正确，表达可更完整',
        strengths: ['思路正确'],
        issues: ['语言不够完整'],
        suggestions: ['补充说明句'],
      },
    ]);

    expect(summary.totalPages).toBe(2);
    expect(summary.averageScore).toBe(7.5);
    expect(summary.rows[1]?.level).toBe('基本达到');
    expect(summary.levelCounts).toEqual({
      超出预期: 0,
      达到预期: 0,
      基本达到: 1,
      待提升: 1,
    });
  });
});

describe('normalizeBatchReviewScore', () => {
  it('keeps 10-point scores as-is', () => {
    expect(normalizeBatchReviewScore(8)).toBe(8);
    expect(normalizeBatchReviewScore(8.5)).toBe(8.5);
  });

  it('converts 100-point model scores into 10-point scores', () => {
    expect(normalizeBatchReviewScore(85)).toBe(8.5);
    expect(normalizeBatchReviewScore(100)).toBe(10);
  });

  it('rounds freeform scores into half-point buckets', () => {
    expect(normalizeBatchReviewScore(8.24)).toBe(8);
    expect(normalizeBatchReviewScore(8.26)).toBe(8.5);
    expect(normalizeBatchReviewScore(8.74)).toBe(8.5);
    expect(normalizeBatchReviewScore(8.76)).toBe(9);
  });
});
