import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatchReviewTaskSnapshot } from '../../shared/types';
import BatchReviewResultPage from './BatchReviewResultPage';

afterEach(() => {
  vi.useRealTimers();
});

describe('BatchReviewResultPage', () => {
  it('renders the summary and per-page teacher comments', () => {
    const task: BatchReviewTaskSnapshot = {
      taskId: 'batch-1',
      status: 'completed',
      totalPages: 2,
      processedPages: 2,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:05:00.000Z',
      result: {
        taskId: 'batch-1',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 2,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
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
      },
    };

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-1']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task,
                  accessToken: 'token',
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('班级批量批改结果')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /第 1 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByAltText('第 1 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-1.png'
    );
    expect(screen.getAllByText('图示完整，但说明不够清楚')).toHaveLength(2);
    expect(screen.getByText('平均分 7.5')).toBeInTheDocument();
  });

  it('switches to the matching detail when a summary card is clicked', () => {
    const task: BatchReviewTaskSnapshot = {
      taskId: 'batch-summary-select',
      status: 'completed',
      totalPages: 2,
      processedPages: 2,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:05:00.000Z',
      result: {
        taskId: 'batch-summary-select',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 2,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
          {
            pageNo: 2,
            displayName: '第 2 份',
            answerImageObjectKey: 'derived/page-2.png',
            answerImageUrl: 'https://oss.example.com/page-2.png',
            score: 6,
            level: '基本达到',
            summary: '第二页已完成',
            strengths: ['方法接近正确'],
            issues: ['计算有误'],
            suggestions: ['复核中间过程'],
          },
        ],
        summary: {
          totalPages: 2,
          averageScore: 7,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
            {
              pageNo: 2,
              displayName: '第 2 份',
              score: 6,
              level: '基本达到',
              summary: '第二页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 1,
            待提升: 0,
          },
        },
      },
    };

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-summary-select']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task,
                  accessToken: 'token',
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /第 1 份 达到预期 得分 8/i }));

    expect(screen.getByRole('tab', { name: /第 1 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByAltText('第 1 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-1.png'
    );

    fireEvent.click(screen.getByRole('button', { name: /第 2 份 基本达到 得分 6/i }));

    expect(screen.getByRole('tab', { name: /第 2 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByAltText('第 2 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-2.png'
    );
  });

  it('polls at the configured interval instead of immediately looping', async () => {
    vi.useFakeTimers();

    const queuedTask: BatchReviewTaskSnapshot = {
      taskId: 'batch-queued',
      status: 'queued',
      processedPages: 0,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
    };
    const requestBatchReviewTask = vi.fn().mockResolvedValue(queuedTask);

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-queued']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task: queuedTask,
                  accessToken: 'token',
                })}
                requestBatchReviewTask={requestBatchReviewTask}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(requestBatchReviewTask).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1400);
    expect(requestBatchReviewTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(requestBatchReviewTask).toHaveBeenCalledTimes(2);
  });

  it('keeps polling with backoff after a transient fetch failure', async () => {
    vi.useFakeTimers();

    const queuedTask: BatchReviewTaskSnapshot = {
      taskId: 'batch-poll-retry',
      status: 'queued',
      processedPages: 0,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
    };
    const requestBatchReviewTask = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(queuedTask);

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-poll-retry']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task: queuedTask,
                  accessToken: 'token',
                })}
                requestBatchReviewTask={requestBatchReviewTask}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/轮询失败，正在自动重试/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(requestBatchReviewTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    expect(requestBatchReviewTask).toHaveBeenCalledTimes(2);
  });

  it('shows progress and partial results while the task is still processing', () => {
    const task = {
      taskId: 'batch-2',
      status: 'processing',
      totalPages: 3,
      processedPages: 1,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:02:00.000Z',
      result: {
        taskId: 'batch-2',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤比较完整'],
            issues: ['说明略少'],
            suggestions: ['补充文字说明'],
          },
        ],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    } as BatchReviewTaskSnapshot;

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-2']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task,
                  accessToken: 'token',
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('已完成 1 / 3 份')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /第 1 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByAltText('第 1 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-1.png'
    );
    expect(screen.getAllByText('第一页已完成')).toHaveLength(2);
    expect(screen.getByText('平均分 8')).toBeInTheDocument();
  });

  it('auto-focuses the latest finished page until the user selects a tab manually', async () => {
    vi.useFakeTimers();

    const initialTask: BatchReviewTaskSnapshot = {
      taskId: 'batch-3',
      status: 'processing',
      totalPages: 3,
      processedPages: 1,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
      result: {
        taskId: 'batch-3',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
        ],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    };
    const secondTask: BatchReviewTaskSnapshot = {
      ...initialTask,
      processedPages: 2,
      updatedAt: '2026-04-16T10:00:03.000Z',
      result: {
        taskId: 'batch-3',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 2,
        pages: [
          initialTask.result!.pages[0]!,
          {
            pageNo: 2,
            displayName: '第 2 份',
            answerImageObjectKey: 'derived/page-2.png',
            answerImageUrl: 'https://oss.example.com/page-2.png',
            score: 6,
            level: '基本达到',
            summary: '第二页已完成',
            strengths: ['方法接近正确'],
            issues: ['计算有误'],
            suggestions: ['复核中间过程'],
          },
        ],
        summary: {
          totalPages: 2,
          averageScore: 7,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
            {
              pageNo: 2,
              displayName: '第 2 份',
              score: 6,
              level: '基本达到',
              summary: '第二页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 1,
            待提升: 0,
          },
        },
      },
    };
    const thirdTask: BatchReviewTaskSnapshot = {
      ...secondTask,
      processedPages: 3,
      updatedAt: '2026-04-16T10:00:06.000Z',
      result: {
        taskId: 'batch-3',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 3,
        pages: [
          ...secondTask.result!.pages,
          {
            pageNo: 3,
            displayName: '第 3 份',
            answerImageObjectKey: 'derived/page-3.png',
            answerImageUrl: 'https://oss.example.com/page-3.png',
            score: 9,
            level: '超出预期',
            summary: '第三页已完成',
            strengths: ['过程完整'],
            issues: ['无明显问题'],
            suggestions: ['保持'],
          },
        ],
        summary: {
          totalPages: 3,
          averageScore: 7.7,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
            {
              pageNo: 2,
              displayName: '第 2 份',
              score: 6,
              level: '基本达到',
              summary: '第二页已完成',
            },
            {
              pageNo: 3,
              displayName: '第 3 份',
              score: 9,
              level: '超出预期',
              summary: '第三页已完成',
            },
          ],
          levelCounts: {
            超出预期: 1,
            达到预期: 1,
            基本达到: 1,
            待提升: 0,
          },
        },
      },
    };
    const requestBatchReviewTask = vi
      .fn()
      .mockResolvedValueOnce(secondTask)
      .mockResolvedValueOnce(thirdTask);

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-3']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task: initialTask,
                  accessToken: 'token',
                })}
                requestBatchReviewTask={requestBatchReviewTask}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('tab', { name: /第 2 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByAltText('第 2 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-2.png'
    );

    fireEvent.click(screen.getByRole('tab', { name: /第 1 页/ }));
    expect(screen.getByRole('tab', { name: /第 1 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('tab', { name: /第 1 页/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByAltText('第 1 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-1.png'
    );
  });

  it('still renders partial results when the task fails after processing some pages', () => {
    const task: BatchReviewTaskSnapshot = {
      taskId: 'batch-failed',
      status: 'failed',
      totalPages: 3,
      processedPages: 1,
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:05:00.000Z',
      errorMessage:
        '调用批量批改多模态模型失败: HTTP 429 Too Many Requests - rate limit exceeded',
      result: {
        taskId: 'batch-failed',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
        ],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    };

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-failed']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task,
                  accessToken: 'token',
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('批量批改失败')).toBeInTheDocument();
    expect(
      screen.getByText(
        '调用批量批改多模态模型失败: HTTP 429 Too Many Requests - rate limit exceeded'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('先看已经完成的点评')).toBeInTheDocument();
    expect(screen.getByAltText('第 1 份学生答案')).toHaveAttribute(
      'src',
      'https://oss.example.com/page-1.png'
    );
  });

  it('auto-retries the remaining unfinished pages once after a failed batch task', async () => {
    const failedTask: BatchReviewTaskSnapshot = {
      taskId: 'batch-auto-retry',
      status: 'failed',
      totalPages: 3,
      processedPages: 1,
      pendingPageNos: [2, 3],
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:05:00.000Z',
      errorMessage: '网络波动',
      result: {
        taskId: 'batch-auto-retry',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
        ],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    };
    const queuedRetryTask: BatchReviewTaskSnapshot = {
      ...failedTask,
      status: 'queued',
      errorMessage: undefined,
    };
    const retryBatchReviewTask = vi.fn().mockResolvedValue(queuedRetryTask);

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-auto-retry']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task: failedTask,
                  accessToken: 'token',
                })}
                retryBatchReviewTask={retryBatchReviewTask}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(retryBatchReviewTask).toHaveBeenCalledWith('token', 'batch-auto-retry');
    expect(screen.getByText(/正在自动续跑剩余未完成页/)).toBeInTheDocument();
  });

  it('allows manually retrying the selected pages after the automatic retry fails', async () => {
    const failedTask: BatchReviewTaskSnapshot = {
      taskId: 'batch-manual-retry',
      status: 'failed',
      totalPages: 3,
      processedPages: 1,
      pendingPageNos: [2, 3],
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:05:00.000Z',
      errorMessage: '网络波动',
      result: {
        taskId: 'batch-manual-retry',
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
        totalPages: 1,
        pages: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            answerImageObjectKey: 'derived/page-1.png',
            answerImageUrl: 'https://oss.example.com/page-1.png',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
            strengths: ['步骤完整'],
            issues: ['说明略少'],
            suggestions: ['补充说明'],
          },
        ],
        summary: {
          totalPages: 1,
          averageScore: 8,
          rows: [
            {
              pageNo: 1,
              displayName: '第 1 份',
              score: 8,
              level: '达到预期',
              summary: '第一页已完成',
            },
          ],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 0,
            待提升: 0,
          },
        },
      },
    };
    const retryBatchReviewTask = vi
      .fn()
      .mockRejectedValueOnce(new Error('自动续跑失败'))
      .mockResolvedValueOnce({
        ...failedTask,
        status: 'queued',
        pendingPageNos: [3],
        errorMessage: undefined,
      });

    render(
      <MemoryRouter initialEntries={['/batch-review/result/batch-manual-retry']}>
        <Routes>
          <Route
            path="/batch-review/result/:taskId"
            element={
              <BatchReviewResultPage
                loadTaskSnapshot={() => ({
                  task: failedTask,
                  accessToken: 'token',
                })}
                retryBatchReviewTask={retryBatchReviewTask}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('自动续跑失败')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /选择第 2 页/ }));
    fireEvent.click(screen.getByRole('button', { name: /重批选中 1 页/ }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(retryBatchReviewTask).toHaveBeenLastCalledWith(
      'token',
      'batch-manual-retry',
      [2]
    );
  });
});
