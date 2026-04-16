import {
  BatchReviewLevel,
  BatchReviewResult,
  BatchReviewPageResult,
  BatchReviewSummary,
  BatchReviewTaskSnapshot,
} from './types';

const BATCH_REVIEW_LEVELS: BatchReviewLevel[] = [
  '超出预期',
  '达到预期',
  '基本达到',
  '待提升',
];

export function normalizeBatchReviewScore(input: number): number {
  if (!Number.isFinite(input)) {
    return 0;
  }

  let normalized = input;

  if (normalized > 10 && normalized <= 100) {
    normalized = normalized / 10;
  }

  normalized = Math.max(0, Math.min(10, normalized));
  normalized = Math.round(normalized * 2) / 2;

  return parseFloat(normalized.toFixed(1));
}

export function normalizeBatchReviewLevel(input: string): BatchReviewLevel {
  const cleaned = (input ?? '').trim();
  if (BATCH_REVIEW_LEVELS.includes(cleaned as BatchReviewLevel)) {
    return cleaned as BatchReviewLevel;
  }
  if (
    cleaned.includes('未达到') ||
    cleaned.includes('未达标') ||
    cleaned.includes('待改进') ||
    cleaned.includes('待提升')
  ) {
    return '待提升';
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
    const level = normalizeBatchReviewLevel(page.level);
    const score = normalizeBatchReviewScore(page.score);
    sumScore += score;
    return {
      pageNo: page.pageNo,
      displayName: page.displayName,
      score,
      level,
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

export function sortBatchReviewPages(
  pages: BatchReviewPageResult[]
): BatchReviewPageResult[] {
  return [...pages].sort((left, right) => left.pageNo - right.pageNo);
}

export function mergeBatchReviewPages(
  basePages: BatchReviewPageResult[],
  updatedPages: BatchReviewPageResult[]
): BatchReviewPageResult[] {
  const merged = new Map<number, BatchReviewPageResult>();

  for (const page of basePages) {
    merged.set(page.pageNo, page);
  }

  for (const page of updatedPages) {
    merged.set(page.pageNo, page);
  }

  return sortBatchReviewPages([...merged.values()]);
}

export function buildBatchReviewResult(
  input: Pick<BatchReviewResult, 'taskId' | 'answerPdfObjectKey' | 'rubricObjectKey'>,
  pages: BatchReviewPageResult[],
  totalPages = pages.length
): BatchReviewResult {
  const sortedPages = sortBatchReviewPages(pages);

  return {
    taskId: input.taskId,
    answerPdfObjectKey: input.answerPdfObjectKey,
    rubricObjectKey: input.rubricObjectKey,
    totalPages,
    pages: sortedPages,
    summary: buildBatchReviewSummary(sortedPages),
  };
}

export function getPendingBatchReviewPageNos(
  task: Pick<
    BatchReviewTaskSnapshot,
    'pendingPageNos' | 'totalPages' | 'processedPages' | 'result'
  >
): number[] {
  if (task.pendingPageNos?.length) {
    return [...task.pendingPageNos].sort((left, right) => left - right);
  }

  const totalPages = task.totalPages ?? task.result?.totalPages ?? 0;

  if (totalPages <= 0) {
    return [];
  }

  const completedPageNos = new Set(
    (task.result?.pages ?? []).map((page) => page.pageNo)
  );

  return Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (pageNo) => !completedPageNos.has(pageNo)
  );
}
