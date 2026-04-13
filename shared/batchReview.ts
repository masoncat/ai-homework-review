import {
  BatchReviewLevel,
  BatchReviewPageResult,
  BatchReviewSummary,
} from './types';

const BATCH_REVIEW_LEVELS: BatchReviewLevel[] = [
  '超出预期',
  '达到预期',
  '基本达到',
  '待提升',
];

export function normalizeBatchReviewLevel(input: string): BatchReviewLevel {
  const cleaned = (input ?? '').trim();
  if (BATCH_REVIEW_LEVELS.includes(cleaned as BatchReviewLevel)) {
    return cleaned as BatchReviewLevel;
  }
  if (cleaned.includes('超出')) {
    return '超出预期';
  }
  if (cleaned.includes('基本')) {
    return '基本达到';
  }
  if (cleaned.includes('达到')) {
    return '达到预期';
  }
  return '待提升';
}

export function buildBatchReviewSummary(pages: BatchReviewPageResult[]): BatchReviewSummary {
  const totalPages = pages.length;
  let sumScore = 0;
  const rows = pages.map((page) => {
    sumScore += page.score;
    return {
      pageNo: page.pageNo,
      displayName: page.displayName,
      score: page.score,
      level: page.level,
      summary: page.summary,
    };
  });

  const levelCounts: Record<BatchReviewLevel, number> = BATCH_REVIEW_LEVELS.reduce(
    (acc, level) => {
      acc[level] = 0;
      return acc;
    },
    {} as Record<BatchReviewLevel, number>,
  );

  for (const page of pages) {
    levelCounts[normalizeBatchReviewLevel(page.level)] += 1;
  }

  const averageScore =
    totalPages === 0
      ? 0
      : parseFloat((sumScore / totalPages).toFixed(1));

  return {
    totalPages,
    averageScore,
    rows,
    levelCounts,
  };
}
