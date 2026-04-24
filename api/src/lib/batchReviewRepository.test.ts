import { describe, expect, it, vi } from 'vitest';
import { createBatchReviewRepository } from './batchReviewRepository.js';

function createDb() {
  const transaction = {
    execute: vi.fn(),
    query: vi.fn(),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
  };

  const db = {
    execute: vi.fn(),
    query: vi.fn(),
    beginTransaction: vi.fn(async () => transaction),
  };

  return {
    db,
    transaction,
    repo: createBatchReviewRepository(db as never),
  };
}

describe('createBatchReviewRepository', () => {
  it('creates a task with page rows atomically and lists summaries by invite code', async () => {
    const { db, transaction, repo } = createDb();
    transaction.execute.mockResolvedValue([{ insertId: 1 }]);
    db.query.mockResolvedValueOnce([
      [
        {
          id: 'task-1',
          session_invite_code: 'demo-code',
          parent_task_id: null,
          status: 'queued',
          total_pages: 3,
          processed_pages: 0,
          succeeded_pages: 0,
          failed_pages: 0,
          pending_pages: 3,
          retryable_page_count: 3,
          summary_json: '{"text":"等待处理"}',
          created_at: '2026-04-25 00:00:00',
          updated_at: '2026-04-25 00:00:00',
        },
      ],
    ]);

    await repo.createTask({
      taskId: 'task-1',
      inviteCode: 'demo-code',
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      pageNos: [1, 2, 3],
    });

    const summaries = await repo.listTaskSummaries('demo-code', 7);

    expect(db.beginTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.execute).toHaveBeenCalledTimes(2);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(summaries[0]).toMatchObject({
      taskId: 'task-1',
      status: 'queued',
      hasRetryablePages: true,
      createdAt: '2026-04-25T00:00:00.000Z',
    });
  });

  it('rolls back task creation when page-row insert fails', async () => {
    const { transaction, repo } = createDb();
    const pageInsertError = new Error('page insert failed');
    transaction.execute
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockRejectedValueOnce(pageInsertError);

    await expect(
      repo.createTask({
        taskId: 'task-1',
        inviteCode: 'demo-code',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        pageNos: [1, 2, 3],
      })
    ).rejects.toThrow('page insert failed');

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('loads task detail with parsed summary and ordered pages', async () => {
    const { db, repo } = createDb();
    db.query
      .mockResolvedValueOnce([
        [
          {
            id: 'task-1',
            session_invite_code: 'demo-code',
            parent_task_id: 'task-0',
            retry_from_task_id: 'task-0',
            status: 'partial_failed',
            answer_pdf_object_key: 'uploads/batch/answers.pdf',
            rubric_object_key: 'uploads/batch/rubric.pdf',
            total_pages: 3,
            processed_pages: 2,
            succeeded_pages: 1,
            failed_pages: 1,
            pending_pages: 1,
            summary_json: '{"text":"部分完成"}',
            last_error_message: 'page 3 failed',
            worker_id: 'worker-1',
            locked_at: '2026-04-25 00:10:00',
            queued_at: '2026-04-25 00:00:00',
            started_at: '2026-04-25 00:05:00',
            finished_at: null,
            created_at: '2026-04-25 00:00:00',
            updated_at: '2026-04-25 00:15:00',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'task-1:1',
            task_id: 'task-1',
            page_no: 1,
            status: 'completed',
            answer_image_object_key: 'derived/page-1.png',
            answer_image_url: 'https://oss.example.com/page-1.png',
            score: 8.5,
            level: '达到预期',
            summary: '完成',
            result_json: '{"score":8.5}',
            error_message: null,
            created_at: '2026-04-25 00:00:00',
            updated_at: '2026-04-25 00:08:00',
            finished_at: '2026-04-25 00:08:00',
          },
          {
            id: 'task-1:3',
            task_id: 'task-1',
            page_no: 3,
            status: 'failed',
            answer_image_object_key: null,
            answer_image_url: null,
            score: null,
            level: null,
            summary: null,
            result_json: null,
            error_message: 'ocr failed',
            created_at: '2026-04-25 00:00:00',
            updated_at: '2026-04-25 00:12:00',
            finished_at: null,
          },
        ],
      ]);

    const detail = await repo.getTaskDetail('task-1', 'demo-code');

    expect(detail).toMatchObject({
      taskId: 'task-1',
      inviteCode: 'demo-code',
      parentTaskId: 'task-0',
      retryFromTaskId: 'task-0',
      summary: { text: '部分完成' },
      queuedAt: '2026-04-25T00:00:00.000Z',
      pages: [
        {
          id: 'task-1:1',
          pageNo: 1,
          result: { score: 8.5 },
          finishedAt: '2026-04-25T00:08:00.000Z',
        },
        {
          id: 'task-1:3',
          pageNo: 3,
          errorMessage: 'ocr failed',
        },
      ],
    });
  });

  it('creates a retry child task from failed and pending-like pages', async () => {
    const { db, transaction, repo } = createDb();
    db.query
      .mockResolvedValueOnce([
        [
          {
            id: 'task-parent',
            session_invite_code: 'demo-code',
            answer_pdf_object_key: 'uploads/batch/answers.pdf',
            rubric_object_key: 'uploads/batch/rubric.pdf',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { page_no: 2 },
          { page_no: 3 },
          { page_no: 4 },
        ],
      ]);
    transaction.execute.mockResolvedValue([{ insertId: 1 }]);

    await repo.createRetryChildTask({
      parentTaskId: 'task-parent',
      newTaskId: 'task-child',
      inviteCode: 'demo-code',
    });

    const taskInsertParams = transaction.execute.mock.calls[0]?.[1] as unknown[];
    const pageInsertParams = transaction.execute.mock.calls[1]?.[1] as unknown[];

    expect(taskInsertParams).toContain('task-child');
    expect(taskInsertParams).toContain('task-parent');
    expect(pageInsertParams).toEqual([
      'task-child:2',
      'task-child',
      2,
      'pending',
      expect.any(Date),
      expect.any(Date),
      'task-child:3',
      'task-child',
      3,
      'pending',
      expect.any(Date),
      expect.any(Date),
      'task-child:4',
      'task-child',
      4,
      'pending',
      expect.any(Date),
      expect.any(Date),
    ]);
  });

  it('lists notifications for an invite code', async () => {
    const { db, repo } = createDb();
    db.query.mockResolvedValueOnce([
      [
        {
          id: 'notification-1',
          task_id: 'task-1',
          type: 'task_completed',
          title: '批改完成',
          message: '任务已完成',
          is_read: 0,
          created_at: '2026-04-25 01:00:00',
        },
      ],
    ]);

    const notifications = await repo.listNotifications('demo-code');

    expect(notifications).toEqual([
      {
        id: 'notification-1',
        taskId: 'task-1',
        type: 'task_completed',
        title: '批改完成',
        message: '任务已完成',
        isRead: false,
        createdAt: '2026-04-25T01:00:00.000Z',
      },
    ]);
  });

  it('marks a notification as read when a row is updated', async () => {
    const { db, repo } = createDb();
    db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      repo.markNotificationRead('notification-1', 'demo-code')
    ).resolves.toBe(true);
  });
});
