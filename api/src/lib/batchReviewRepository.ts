import type {
  BatchReviewNotification,
  BatchReviewPageLifecycleStatus,
  BatchReviewTaskStatus,
  BatchReviewTaskSummary,
} from '../../../shared/types.js';

interface BatchReviewTaskRow {
  id: string;
  session_invite_code: string;
  parent_task_id: string | null;
  retry_from_task_id: string | null;
  status: BatchReviewTaskStatus;
  answer_pdf_object_key: string;
  rubric_object_key: string;
  total_pages: number;
  processed_pages: number;
  succeeded_pages: number;
  failed_pages: number;
  pending_pages: number;
  summary_json: unknown;
  last_error_message: string | null;
  worker_id: string | null;
  locked_at: Date | string | null;
  queued_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  latest_child_task_id?: string | null;
  retryable_page_count?: number;
  page_nos?: string | null;
}

interface BatchReviewTaskPageRow {
  id: string;
  task_id: string;
  page_no: number;
  status: BatchReviewPageLifecycleStatus;
  answer_image_object_key: string | null;
  answer_image_url: string | null;
  score: number | null;
  level: string | null;
  summary: string | null;
  result_json: unknown;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
}

interface BatchReviewNotificationRow {
  id: string;
  task_id: string;
  type: BatchReviewNotification['type'];
  title: string;
  message: string;
  is_read: number | boolean;
  created_at: Date | string;
}

interface ExecuteResult {
  affectedRows?: number;
}

export interface BatchReviewTaskDetailPage {
  id: string;
  pageNo: number;
  status: BatchReviewPageLifecycleStatus;
  answerImageObjectKey?: string;
  answerImageUrl?: string;
  score?: number;
  level?: string;
  summary?: string;
  result?: unknown;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface BatchReviewTaskDetail {
  taskId: string;
  inviteCode: string;
  parentTaskId?: string;
  retryFromTaskId?: string;
  status: BatchReviewTaskStatus;
  answerPdfObjectKey: string;
  rubricObjectKey: string;
  totalPages: number;
  processedPages: number;
  succeededPages: number;
  failedPages: number;
  pendingPages: number;
  summary: unknown;
  lastErrorMessage?: string;
  workerId?: string;
  lockedAt?: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  pages: BatchReviewTaskDetailPage[];
}

export interface BatchReviewRepository {
  createTask(input: {
    taskId: string;
    inviteCode: string;
    answerPdfObjectKey: string;
    rubricObjectKey: string;
    pageNos: number[];
    parentTaskId?: string;
    retryFromTaskId?: string;
  }): Promise<void>;
  listTaskSummaries(
    inviteCode: string,
    lookbackDays: number
  ): Promise<BatchReviewTaskSummary[]>;
  getTaskDetail(
    taskId: string,
    inviteCode: string
  ): Promise<BatchReviewTaskDetail | null>;
  createRetryChildTask(input: {
    parentTaskId: string;
    newTaskId: string;
    inviteCode: string;
  }): Promise<void>;
  listNotifications(inviteCode: string): Promise<BatchReviewNotification[]>;
  markNotificationRead(
    notificationId: string,
    inviteCode: string
  ): Promise<boolean>;
  claimNextQueuedTask(workerId: string): Promise<{
    taskId: string;
    inviteCode: string;
    answerPdfObjectKey: string;
    rubricObjectKey: string;
    pageNos: number[];
  } | null>;
  markTaskRunning(taskId: string, workerId: string): Promise<void>;
  markPageRunning(taskId: string, pageNo: number): Promise<void>;
  saveCompletedPage(input: {
    taskId: string;
    pageNo: number;
    answerImageObjectKey: string;
    answerImageUrl: string;
    score: number;
    level: string;
    summary: string;
    displayName: string;
    strengths: string[];
    issues: string[];
    suggestions: string[];
  }): Promise<void>;
  saveFailedPage(input: {
    taskId: string;
    pageNo: number;
    errorMessage: string;
  }): Promise<void>;
  finalizeTask(input: {
    taskId: string;
    status: Extract<BatchReviewTaskStatus, 'completed' | 'partial_failed' | 'failed'>;
    processedPages: number;
    succeededPages: number;
    failedPages: number;
    pendingPages: number;
    summary: unknown;
    lastErrorMessage?: string;
  }): Promise<void>;
  createNotification(input: {
    inviteCode: string;
    taskId: string;
    type: BatchReviewNotification['type'];
    title: string;
    message: string;
  }): Promise<void>;
  createTaskEvent(input: {
    taskId: string;
    eventType: string;
    payload: unknown;
  }): Promise<void>;
}

export interface BatchReviewRepositoryDb {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
  beginTransaction(): Promise<BatchReviewRepositoryTransaction>;
}

export interface BatchReviewRepositoryTransaction {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

const DEFAULT_SUMMARY = {
  text: '等待处理',
};

const RETRYABLE_PAGE_STATUSES: BatchReviewPageLifecycleStatus[] = [
  'failed',
  'pending',
  'running',
  'skipped',
];

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }

  if (Array.isArray(result)) {
    return result as T[];
  }

  return [];
}

function getExecuteResult(result: unknown): ExecuteResult | null {
  if (Array.isArray(result)) {
    const [first] = result;
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return first as ExecuteResult;
    }
  }

  if (result && typeof result === 'object') {
    return result as ExecuteResult;
  }

  return null;
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const trimmed = value.trim();
  const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T00:00:00Z`
      : trimmed;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatSummaryAverageScore(value: unknown): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getStructuredSummaryText(value: Record<string, unknown>): string | null {
  const rows = Array.isArray(value.rows) ? value.rows : [];

  if (rows.length === 1) {
    const firstRow = rows[0];

    if (firstRow && typeof firstRow === 'object') {
      const rowSummary = (firstRow as Record<string, unknown>).summary;

      if (typeof rowSummary === 'string' && rowSummary.trim()) {
        return rowSummary;
      }
    }
  }

  const totalPages = value.totalPages;
  const averageScore = formatSummaryAverageScore(value.averageScore);

  if (typeof totalPages === 'number' && !Number.isNaN(totalPages)) {
    return averageScore === null
      ? `共处理 ${totalPages} 份作业`
      : `共处理 ${totalPages} 份作业，平均分 ${averageScore}`;
  }

  return null;
}

function getSummaryText(value: unknown): string {
  const parsed = parseJsonValue(value);

  if (typeof parsed === 'string') {
    return parsed;
  }

  if (parsed && typeof parsed === 'object') {
    const summaryRecord = parsed as Record<string, unknown>;
    for (const key of ['text', 'summary', 'message']) {
      const candidate = summaryRecord[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    const structuredSummaryText = getStructuredSummaryText(summaryRecord);
    if (structuredSummaryText) {
      return structuredSummaryText;
    }
    return JSON.stringify(parsed);
  }

  return DEFAULT_SUMMARY.text;
}

function mapTaskSummary(row: BatchReviewTaskRow): BatchReviewTaskSummary {
  const retryablePageCount = Number(row.retryable_page_count ?? 0);

  return {
    taskId: row.id,
    parentTaskId: row.parent_task_id ?? undefined,
    status:
      row.status === 'processing'
        ? 'running'
        : row.status,
    totalPages: Number(row.total_pages ?? 0),
    processedPages: Number(row.processed_pages ?? 0),
    succeededPages: Number(row.succeeded_pages ?? 0),
    failedPages: Number(row.failed_pages ?? 0),
    summary: getSummaryText(row.summary_json),
    hasRetryablePages: retryablePageCount > 0,
    latestChildTaskId: row.latest_child_task_id ?? undefined,
    createdAt: toIsoString(row.created_at) ?? '',
    updatedAt: toIsoString(row.updated_at) ?? '',
  };
}

function mapTaskPage(row: BatchReviewTaskPageRow): BatchReviewTaskDetailPage {
  return {
    id: row.id,
    pageNo: Number(row.page_no),
    status: row.status,
    answerImageObjectKey: row.answer_image_object_key ?? undefined,
    answerImageUrl: row.answer_image_url ?? undefined,
    score: row.score == null ? undefined : Number(row.score),
    level: row.level ?? undefined,
    summary: row.summary ?? undefined,
    result: parseJsonValue(row.result_json) ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: toIsoString(row.created_at) ?? '',
    updatedAt: toIsoString(row.updated_at) ?? '',
    finishedAt: toIsoString(row.finished_at),
  };
}

function mapTaskDetail(
  taskRow: BatchReviewTaskRow,
  pageRows: BatchReviewTaskPageRow[]
): BatchReviewTaskDetail {
  return {
    taskId: taskRow.id,
    inviteCode: taskRow.session_invite_code,
    parentTaskId: taskRow.parent_task_id ?? undefined,
    retryFromTaskId: taskRow.retry_from_task_id ?? undefined,
    status: taskRow.status,
    answerPdfObjectKey: taskRow.answer_pdf_object_key,
    rubricObjectKey: taskRow.rubric_object_key,
    totalPages: Number(taskRow.total_pages ?? 0),
    processedPages: Number(taskRow.processed_pages ?? 0),
    succeededPages: Number(taskRow.succeeded_pages ?? 0),
    failedPages: Number(taskRow.failed_pages ?? 0),
    pendingPages: Number(taskRow.pending_pages ?? 0),
    summary: parseJsonValue(taskRow.summary_json),
    lastErrorMessage: taskRow.last_error_message ?? undefined,
    workerId: taskRow.worker_id ?? undefined,
    lockedAt: toIsoString(taskRow.locked_at),
    queuedAt: toIsoString(taskRow.queued_at) ?? '',
    startedAt: toIsoString(taskRow.started_at),
    finishedAt: toIsoString(taskRow.finished_at),
    createdAt: toIsoString(taskRow.created_at) ?? '',
    updatedAt: toIsoString(taskRow.updated_at) ?? '',
    pages: pageRows.map(mapTaskPage),
  };
}

function mapNotification(row: BatchReviewNotificationRow): BatchReviewNotification {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: Boolean(row.is_read),
    createdAt: toIsoString(row.created_at) ?? '',
  };
}

function buildPageInsertSql(pageCount: number): string {
  const placeholders = Array.from(
    { length: pageCount },
    () => '(?, ?, ?, ?, ?, ?)'
  ).join(', ');

  return `
INSERT INTO batch_review_task_pages (
  id,
  task_id,
  page_no,
  status,
  created_at,
  updated_at
)
VALUES ${placeholders}
`;
}

function getRetryablePageStatusPlaceholders(): string {
  return RETRYABLE_PAGE_STATUSES.map(() => '?').join(', ');
}

function parsePageNos(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

export function createBatchReviewRepository(
  db: BatchReviewRepositoryDb
): BatchReviewRepository {
  return {
    async createTask(input) {
      const now = new Date();
      const totalPages = input.pageNos.length;
      const transaction = await db.beginTransaction();

      try {
        await transaction.execute(
        `
INSERT INTO batch_review_tasks (
  id,
  session_invite_code,
  parent_task_id,
  retry_from_task_id,
  status,
  answer_pdf_object_key,
  rubric_object_key,
  total_pages,
  processed_pages,
  succeeded_pages,
  failed_pages,
  pending_pages,
  summary_json,
  queued_at,
  created_at,
  updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
          [
            input.taskId,
            input.inviteCode,
            input.parentTaskId ?? null,
            input.retryFromTaskId ?? null,
            'queued',
            input.answerPdfObjectKey,
            input.rubricObjectKey,
            totalPages,
            0,
            0,
            0,
            totalPages,
            JSON.stringify(DEFAULT_SUMMARY),
            now,
            now,
            now,
          ]
        );

        if (input.pageNos.length > 0) {
          const pageParams = input.pageNos.flatMap((pageNo) => [
            `${input.taskId}:${pageNo}`,
            input.taskId,
            pageNo,
            'pending',
            now,
            now,
          ]);

          await transaction.execute(buildPageInsertSql(input.pageNos.length), pageParams);
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async listTaskSummaries(inviteCode, lookbackDays) {
      const rows = getRows<BatchReviewTaskRow>(
        await db.query(
          `
SELECT
  task.*,
  (
    SELECT child.id
    FROM batch_review_tasks child
    WHERE child.parent_task_id = task.id
    ORDER BY child.created_at DESC
    LIMIT 1
  ) AS latest_child_task_id,
  (
    SELECT COUNT(*)
    FROM batch_review_task_pages page
    WHERE page.task_id = task.id
      AND page.status IN (${getRetryablePageStatusPlaceholders()})
  ) AS retryable_page_count
FROM batch_review_tasks task
WHERE task.session_invite_code = ?
  AND task.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
ORDER BY task.created_at DESC
`,
          [...RETRYABLE_PAGE_STATUSES, inviteCode, lookbackDays]
        )
      );

      return rows.map(mapTaskSummary);
    },

    async getTaskDetail(taskId, inviteCode) {
      const taskRows = getRows<BatchReviewTaskRow>(
        await db.query(
          `
SELECT *
FROM batch_review_tasks
WHERE id = ? AND session_invite_code = ?
LIMIT 1
`,
          [taskId, inviteCode]
        )
      );
      const [taskRow] = taskRows;

      if (!taskRow) {
        return null;
      }

      const pageRows = getRows<BatchReviewTaskPageRow>(
        await db.query(
          `
SELECT *
FROM batch_review_task_pages
WHERE task_id = ?
ORDER BY page_no ASC
`,
          [taskId]
        )
      );

      return mapTaskDetail(taskRow, pageRows);
    },

    async createRetryChildTask(input) {
      const taskRows = getRows<BatchReviewTaskRow>(
        await db.query(
          `
SELECT *
FROM batch_review_tasks
WHERE id = ? AND session_invite_code = ?
LIMIT 1
`,
          [input.parentTaskId, input.inviteCode]
        )
      );
      const [parentTask] = taskRows;

      if (!parentTask) {
        throw new Error(`Parent batch review task not found: ${input.parentTaskId}`);
      }

      const pageRows = getRows<BatchReviewTaskPageRow>(
        await db.query(
          `
SELECT *
FROM batch_review_task_pages
WHERE task_id = ?
  AND status IN (${getRetryablePageStatusPlaceholders()})
ORDER BY page_no ASC
`,
          [input.parentTaskId, ...RETRYABLE_PAGE_STATUSES]
        )
      );

      const pageNos = pageRows.map((row) => Number(row.page_no));

      if (pageNos.length === 0) {
        throw new Error(
          `Parent batch review task has no retryable pages: ${input.parentTaskId}`
        );
      }

      await this.createTask({
        taskId: input.newTaskId,
        inviteCode: input.inviteCode,
        answerPdfObjectKey: parentTask.answer_pdf_object_key,
        rubricObjectKey: parentTask.rubric_object_key,
        pageNos,
        parentTaskId: input.parentTaskId,
        retryFromTaskId: input.parentTaskId,
      });
    },

    async listNotifications(inviteCode) {
      const rows = getRows<BatchReviewNotificationRow>(
        await db.query(
          `
SELECT id, task_id, type, title, message, is_read, created_at
FROM batch_review_notifications
WHERE session_invite_code = ?
ORDER BY created_at DESC
`,
          [inviteCode]
        )
      );

      return rows.map(mapNotification);
    },

    async markNotificationRead(notificationId, inviteCode) {
      const now = new Date();
      const result = getExecuteResult(
        await db.execute(
          `
UPDATE batch_review_notifications
SET is_read = 1, read_at = ?, updated_at = ?
WHERE id = ? AND session_invite_code = ? AND is_read = 0
`,
          [now, now, notificationId, inviteCode]
        )
      );

      return Number(result?.affectedRows ?? 0) > 0;
    },

    async claimNextQueuedTask(workerId) {
      const now = new Date();
      const transaction = await db.beginTransaction();

      try {
        const taskRows = getRows<BatchReviewTaskRow>(
          await transaction.query(
            `
SELECT
  task.*,
  GROUP_CONCAT(page.page_no ORDER BY page.page_no ASC) AS page_nos
FROM batch_review_tasks task
JOIN batch_review_task_pages page
  ON page.task_id = task.id
  AND page.status = 'pending'
WHERE task.status = 'queued'
  AND (task.locked_at IS NULL OR task.locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
GROUP BY task.id
ORDER BY task.created_at ASC
LIMIT 1
FOR UPDATE
`,
            []
          )
        );
        const [taskRow] = taskRows;

        if (!taskRow) {
          await transaction.rollback();
          return null;
        }

        await transaction.execute(
          `
UPDATE batch_review_tasks
SET worker_id = ?, locked_at = ?, updated_at = ?
WHERE id = ?
`,
          [workerId, now, now, taskRow.id]
        );
        await transaction.commit();

        return {
          taskId: taskRow.id,
          inviteCode: taskRow.session_invite_code,
          answerPdfObjectKey: taskRow.answer_pdf_object_key,
          rubricObjectKey: taskRow.rubric_object_key,
          pageNos: parsePageNos(taskRow.page_nos),
        };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    },

    async markTaskRunning(taskId, workerId) {
      const now = new Date();
      await db.execute(
        `
UPDATE batch_review_tasks
SET status = 'running',
    worker_id = ?,
    locked_at = ?,
    started_at = COALESCE(started_at, ?),
    updated_at = ?
WHERE id = ?
`,
        [workerId, now, now, now, taskId]
      );
    },

    async markPageRunning(taskId, pageNo) {
      const now = new Date();
      await db.execute(
        `
UPDATE batch_review_task_pages
SET status = 'running', updated_at = ?
WHERE task_id = ? AND page_no = ?
`,
        [now, taskId, pageNo]
      );
    },

    async saveCompletedPage(input) {
      const now = new Date();
      await db.execute(
        `
UPDATE batch_review_task_pages
SET status = 'completed',
    answer_image_object_key = ?,
    answer_image_url = ?,
    score = ?,
    level = ?,
    summary = ?,
    result_json = ?,
    error_message = NULL,
    updated_at = ?,
    finished_at = ?
WHERE task_id = ? AND page_no = ?
`,
        [
          input.answerImageObjectKey,
          input.answerImageUrl,
          input.score,
          input.level,
          input.summary,
          JSON.stringify({
            displayName: input.displayName,
            score: input.score,
            level: input.level,
            summary: input.summary,
            strengths: input.strengths,
            issues: input.issues,
            suggestions: input.suggestions,
          }),
          now,
          now,
          input.taskId,
          input.pageNo,
        ]
      );
      await db.execute(
        `
UPDATE batch_review_tasks
SET processed_pages = processed_pages + 1,
    succeeded_pages = succeeded_pages + 1,
    pending_pages = GREATEST(pending_pages - 1, 0),
    updated_at = ?
WHERE id = ?
`,
        [now, input.taskId]
      );
    },

    async saveFailedPage(input) {
      const now = new Date();
      await db.execute(
        `
UPDATE batch_review_task_pages
SET status = 'failed',
    error_message = ?,
    updated_at = ?,
    finished_at = ?
WHERE task_id = ? AND page_no = ?
`,
        [input.errorMessage, now, now, input.taskId, input.pageNo]
      );
      await db.execute(
        `
UPDATE batch_review_tasks
SET processed_pages = processed_pages + 1,
    failed_pages = failed_pages + 1,
    pending_pages = GREATEST(pending_pages - 1, 0),
    updated_at = ?,
    last_error_message = ?
WHERE id = ?
`,
        [now, input.errorMessage, input.taskId]
      );
    },

    async finalizeTask(input) {
      const now = new Date();
      await db.execute(
        `
UPDATE batch_review_tasks
SET status = ?,
    processed_pages = ?,
    succeeded_pages = ?,
    failed_pages = ?,
    pending_pages = ?,
    summary_json = ?,
    last_error_message = ?,
    locked_at = NULL,
    finished_at = ?,
    updated_at = ?
WHERE id = ?
`,
        [
          input.status,
          input.processedPages,
          input.succeededPages,
          input.failedPages,
          input.pendingPages,
          JSON.stringify(input.summary),
          input.lastErrorMessage ?? null,
          now,
          now,
          input.taskId,
        ]
      );
    },

    async createNotification(input) {
      const now = new Date();
      await db.execute(
        `
INSERT INTO batch_review_notifications (
  id,
  task_id,
  session_invite_code,
  type,
  title,
  message,
  is_read,
  created_at,
  updated_at
)
VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
`,
        [
          crypto.randomUUID(),
          input.taskId,
          input.inviteCode,
          input.type,
          input.title,
          input.message,
          now,
          now,
        ]
      );
    },

    async createTaskEvent(input) {
      await db.execute(
        `
INSERT INTO batch_review_task_events (
  id,
  task_id,
  event_type,
  payload_json,
  created_at
)
VALUES (?, ?, ?, ?, ?)
`,
        [
          crypto.randomUUID(),
          input.taskId,
          input.eventType,
          JSON.stringify(input.payload),
          new Date(),
        ]
      );
    },
  };
}
