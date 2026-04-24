import { describe, expect, it, vi } from 'vitest';
import { createBatchReviewRepository } from './batchReviewRepository.js';

describe('createBatchReviewRepository', () => {
  it('creates a task with page rows and lists summaries by invite code', async () => {
    const execute = vi.fn(async () => [{ insertId: 1 }]);
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          id: 'task-1',
          session_invite_code: 'demo-code',
          status: 'queued',
          total_pages: 3,
          processed_pages: 0,
          succeeded_pages: 0,
          failed_pages: 0,
          summary_json: '{"text":"等待处理"}',
          created_at: '2026-04-25T00:00:00.000Z',
          updated_at: '2026-04-25T00:00:00.000Z',
        },
      ],
    ]);

    const repo = createBatchReviewRepository({ execute, query } as never);

    await repo.createTask({
      taskId: 'task-1',
      inviteCode: 'demo-code',
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      rubricObjectKey: 'uploads/batch/rubric.pdf',
      pageNos: [1, 2, 3],
    });

    const summaries = await repo.listTaskSummaries('demo-code', 7);

    expect(execute).toHaveBeenCalled();
    expect(summaries[0]?.taskId).toBe('task-1');
    expect(summaries[0]?.status).toBe('queued');
  });
});
