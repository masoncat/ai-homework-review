import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPendingBatchReviewPageNos } from '../../shared/batchReview';
import type { BatchReviewTaskSnapshot } from '../../shared/types';
import BatchSummary from '../components/BatchSummary';
import {
  loadLatestBatchReviewTaskSession,
  type BatchReviewTaskSession,
  saveLatestBatchReviewTaskSession,
} from '../lib/demoSession';
import {
  requestBatchReviewTask as defaultRequestBatchReviewTask,
  retryBatchReviewTask as defaultRetryBatchReviewTask,
} from '../lib/api';

interface BatchReviewResultPageProps {
  loadTaskSnapshot?: (taskId: string) => BatchReviewTaskSession | null;
  requestBatchReviewTask?: (
    accessToken: string,
    taskId: string
  ) => Promise<BatchReviewTaskSnapshot>;
  retryBatchReviewTask?: (
    accessToken: string,
    taskId: string,
    pageNos?: number[]
  ) => Promise<BatchReviewTaskSnapshot>;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_BACKOFF_MS = 10000;

export default function BatchReviewResultPage({
  loadTaskSnapshot = (taskId: string) => {
    const session = loadLatestBatchReviewTaskSession();

    if (!session || session.task.taskId !== taskId) {
      return null;
    }

    return session;
  },
  requestBatchReviewTask = defaultRequestBatchReviewTask,
  retryBatchReviewTask = defaultRetryBatchReviewTask,
}: BatchReviewResultPageProps) {
  const { taskId = '' } = useParams();
  const initialSession = loadTaskSnapshot(taskId);
  const [task, setTask] = useState<BatchReviewTaskSnapshot | null>(
    initialSession?.task ?? null
  );
  const accessToken = initialSession?.accessToken ?? '';
  const [pollError, setPollError] = useState('');
  const [selectedPageNo, setSelectedPageNo] = useState<number | null>(
    initialSession?.task.result?.pages.at(-1)?.pageNo ?? null
  );
  const [hasManualTabSelection, setHasManualTabSelection] = useState(false);
  const [autoRetryState, setAutoRetryState] = useState<
    'idle' | 'running' | 'failed' | 'succeeded'
  >('idle');
  const [autoRetryError, setAutoRetryError] = useState('');
  const [manualRetryError, setManualRetryError] = useState('');
  const [manualRetryPending, setManualRetryPending] = useState(false);
  const [selectedRetryPageNos, setSelectedRetryPageNos] = useState<number[]>([]);
  const pollFailureCountRef = useRef(0);
  const hasAttemptedAutoRetryRef = useRef(false);
  const processedPages = task?.processedPages ?? 0;
  const totalPages = task?.totalPages ?? task?.result?.totalPages ?? 0;
  const progressPercent =
    totalPages > 0
      ? Math.min(100, Math.round((processedPages / totalPages) * 100))
      : 0;
  const result = task?.result ?? null;
  const latestFinishedPageNo = result?.pages.at(-1)?.pageNo ?? null;
  const selectedPage =
    result?.pages.find((page) => page.pageNo === selectedPageNo) ??
    result?.pages.at(-1) ??
    null;
  const pendingPageNos = useMemo(
    () => (task ? getPendingBatchReviewPageNos(task) : []),
    [task]
  );
  const retryablePageNos = useMemo(() => {
    if (totalPages > 0) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    return result?.pages.map((page) => page.pageNo) ?? [];
  }, [result?.pages, totalPages]);
  const shouldShowManualRetry =
    task?.status === 'failed' && autoRetryState === 'failed';

  useEffect(() => {
    if (!hasManualTabSelection && latestFinishedPageNo !== null) {
      setSelectedPageNo(latestFinishedPageNo);
    }
  }, [hasManualTabSelection, latestFinishedPageNo]);

  useEffect(() => {
    setAutoRetryState('idle');
    setAutoRetryError('');
    setManualRetryError('');
    setManualRetryPending(false);
    setSelectedRetryPageNos([]);
    pollFailureCountRef.current = 0;
    hasAttemptedAutoRetryRef.current = false;
  }, [taskId]);

  useEffect(() => {
    let timeoutId: number | null = null;

    if (
      !taskId ||
      !accessToken ||
      !task ||
      (task.status !== 'queued' && task.status !== 'processing')
    ) {
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const nextTask = await requestBatchReviewTask(accessToken, taskId);

        if (cancelled) {
          return;
        }

        setTask(nextTask);
        saveLatestBatchReviewTaskSession({
          task: nextTask,
          accessToken,
        });
        setPollError('');
        pollFailureCountRef.current = 0;

        if (nextTask.status === 'queued' || nextTask.status === 'processing') {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        pollFailureCountRef.current += 1;
        setPollError('轮询失败，正在自动重试');
        const nextDelay = Math.min(
          POLL_INTERVAL_MS * 2 ** Math.max(0, pollFailureCountRef.current - 1),
          MAX_POLL_BACKOFF_MS
        );
        timeoutId = window.setTimeout(() => {
          void poll();
        }, nextDelay);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [accessToken, requestBatchReviewTask, task?.status, taskId]);

  useEffect(() => {
    if (
      !task ||
      task.status !== 'failed' ||
      !accessToken ||
      hasAttemptedAutoRetryRef.current ||
      pendingPageNos.length === 0
    ) {
      return;
    }

    let cancelled = false;
    const activeTaskId = task.taskId;

    async function runAutoRetry() {
      hasAttemptedAutoRetryRef.current = true;
      setAutoRetryState('running');
      setAutoRetryError('');

      try {
        const nextTask = await retryBatchReviewTask(accessToken, activeTaskId);

        if (cancelled) {
          return;
        }

        setTask(nextTask);
        saveLatestBatchReviewTaskSession({
          task: nextTask,
          accessToken,
        });
        setAutoRetryState('succeeded');
        setManualRetryError('');
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAutoRetryState('failed');
        setAutoRetryError(
          error instanceof Error ? error.message : '自动续跑失败'
        );
      }
    }

    void runAutoRetry();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    pendingPageNos.length,
    retryBatchReviewTask,
    task?.status,
    task?.taskId,
  ]);

  async function runManualRetry(pageNos?: number[]) {
    if (!task || !accessToken) {
      return;
    }

    setManualRetryPending(true);
    setManualRetryError('');

    try {
      const nextTask = await retryBatchReviewTask(accessToken, task.taskId, pageNos);
      setTask(nextTask);
      saveLatestBatchReviewTaskSession({
        task: nextTask,
        accessToken,
      });
      setSelectedRetryPageNos([]);
      setAutoRetryError('');
    } catch (error) {
      setManualRetryError(
        error instanceof Error ? error.message : '发起重批失败'
      );
    } finally {
      setManualRetryPending(false);
    }
  }

  if (!task) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">批量批改结果</p>
          <h1>当前还没有可展示的批改结果</h1>
          <p className="hero-copy">请返回批量批改页重新提交一次班级答案 PDF 和评分标准材料。</p>
          <div className="result-actions">
            <a className="primary-button" href="#/batch-review">
              返回批量批改
            </a>
          </div>
        </section>
      </main>
    );
  }

  function renderPageTabsAndDetail(
    activeResult: NonNullable<BatchReviewTaskSnapshot['result']>,
    options: {
      eyebrow: string;
      title: string;
      helperText: string;
    }
  ) {
    return (
      <>
        <BatchSummary
          summary={activeResult.summary}
          selectedPageNo={selectedPage?.pageNo ?? selectedPageNo}
          onSelectPage={(pageNo) => {
            setHasManualTabSelection(true);
            setSelectedPageNo(pageNo);
          }}
        />

        <section className="result-section">
          <div className="section-heading">
            <p className="eyebrow">{options.eyebrow}</p>
            <h2>{options.title}</h2>
            <p>{options.helperText}</p>
          </div>

          <div className="batch-page-tabs" role="tablist" aria-label="批量批改页签">
            {Array.from({ length: totalPages }, (_, index) => {
              const pageNo = index + 1;
              const completedPage = activeResult.pages.find(
                (page) => page.pageNo === pageNo
              );
              const isSelected =
                (selectedPage?.pageNo ?? selectedPageNo) === pageNo;

              return (
                <button
                  key={pageNo}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`batch-page-tab ${completedPage ? 'done' : 'pending'}`}
                  onClick={() => {
                    setHasManualTabSelection(true);
                    setSelectedPageNo(pageNo);
                  }}
                >
                  <span>{`第 ${pageNo} 页`}</span>
                  <small>{completedPage ? '已完成' : '处理中'}</small>
                </button>
              );
            })}
          </div>

          <div className="batch-page-detail" role="tabpanel">
            {selectedPage ? (
              <>
                <article className="batch-answer-panel">
                  <div className="batch-answer-header">
                    <p className="eyebrow">学生答案</p>
                    <h3>{selectedPage.displayName}</h3>
                  </div>
                  <img
                    src={selectedPage.answerImageUrl}
                    alt={`${selectedPage.displayName}学生答案`}
                  />
                </article>

                <article className="batch-page-card">
                  <div className="batch-page-head">
                    <div>
                      <p className="eyebrow">老师点评</p>
                      <h3>{selectedPage.displayName}</h3>
                      <p>{selectedPage.summary}</p>
                    </div>
                    <div className="batch-page-score">
                      <strong>{selectedPage.score}</strong>
                      <span>{selectedPage.level}</span>
                    </div>
                  </div>
                  <div className="batch-comment-grid">
                    <section>
                      <strong>做得好的地方</strong>
                      <ul>
                        {selectedPage.strengths.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <strong>主要问题</strong>
                      <ul>
                        {selectedPage.issues.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <strong>改进建议</strong>
                      <ul>
                        {selectedPage.suggestions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </article>
              </>
            ) : (
              <article className="batch-answer-placeholder">
                <p className="eyebrow">当前页状态</p>
                <h3>{selectedPageNo ? `第 ${selectedPageNo} 页` : '等待结果'}</h3>
                <p>当前页尚未完成批改，稍后自动更新。</p>
              </article>
            )}
          </div>
        </section>
      </>
    );
  }

  if (task.status === 'queued' || task.status === 'processing') {
    return (
      <main className="page-shell">
        <section className="result-hero batch-result-hero">
          <p className="eyebrow">班级批量批改结果</p>
          <h1>任务已提交，正在后台批量处理</h1>
          <p className="hero-copy">
            当前状态：{task.status === 'queued' ? '排队中' : '处理中'}。页面会自动轮询，不需要手动刷新。
          </p>
          <span className="status-chip">
            {task.status === 'queued' ? '排队中' : '处理中'}
          </span>
          <div className="batch-progress-panel">
            <div className="batch-progress-meta">
              <strong>
                {totalPages > 0
                  ? `已完成 ${processedPages} / ${totalPages} 份`
                  : '正在准备拆分班级答案 PDF'}
              </strong>
              <span>{progressPercent}%</span>
            </div>
            <div
              className="batch-progress-bar"
              aria-label="批量批改进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              role="progressbar"
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          {pollError ? <p className="error-text">{pollError}</p> : null}
          {autoRetryState === 'running' || autoRetryState === 'succeeded' ? (
            <p className="helper-text">正在自动续跑剩余未完成页</p>
          ) : null}
        </section>

        {result
          ? renderPageTabsAndDetail(result, {
              eyebrow: '已返回结果',
              title: '先看已经完成的点评',
              helperText: '新完成的学生答案会自动加入页签，默认聚焦最新完成的一页。',
            })
          : null}
      </main>
    );
  }

  if (task.status === 'failed') {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">班级批量批改结果</p>
          <h1>批量批改失败</h1>
          <p className="hero-copy">{task.errorMessage ?? '请稍后重试。'}</p>
          {autoRetryState === 'running' ? (
            <p className="helper-text">正在自动续跑剩余未完成页</p>
          ) : null}
          {autoRetryError ? <p className="error-text">{autoRetryError}</p> : null}
          {shouldShowManualRetry ? (
            <div className="batch-retry-panel">
              <div className="batch-retry-head">
                <strong>自动续跑失败后，可直接在当前任务上重批</strong>
                <p>
                  已完成页会保留；你可以续跑剩余未完成页，也可以指定某几页重新批改。
                </p>
              </div>
              {pendingPageNos.length > 0 ? (
                <div className="batch-retry-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={manualRetryPending}
                    onClick={() => {
                      void runManualRetry();
                    }}
                  >
                    重试剩余未完成页
                  </button>
                </div>
              ) : null}
              {retryablePageNos.length > 0 ? (
                <div className="batch-retry-page-picker">
                  {retryablePageNos.map((pageNo) => {
                    const isSelected = selectedRetryPageNos.includes(pageNo);

                    return (
                      <button
                        key={pageNo}
                        type="button"
                        className={`retry-page-chip ${isSelected ? 'selected' : ''}`}
                        disabled={manualRetryPending}
                        onClick={() => {
                          setSelectedRetryPageNos((current) =>
                            current.includes(pageNo)
                              ? current.filter((item) => item !== pageNo)
                              : [...current, pageNo].sort((left, right) => left - right)
                          );
                        }}
                      >
                        {`选择第 ${pageNo} 页`}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="batch-retry-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={manualRetryPending || selectedRetryPageNos.length === 0}
                  onClick={() => {
                    void runManualRetry(selectedRetryPageNos);
                  }}
                >
                  {manualRetryPending
                    ? '正在发起重批'
                    : `重批选中 ${selectedRetryPageNos.length} 页`}
                </button>
              </div>
              {manualRetryError ? (
                <p className="error-text">{manualRetryError}</p>
              ) : null}
            </div>
          ) : null}
          <div className="result-actions">
            <a className="primary-button" href="#/batch-review">
              返回批量批改
            </a>
          </div>
        </section>

        {result
          ? renderPageTabsAndDetail(result, {
              eyebrow: '已保留结果',
              title: '先看已经完成的点评',
              helperText:
                '本次任务在处理中断，已完成页会保留，方便先核对结果再决定是否重试。',
            })
          : null}
      </main>
    );
  }

  if (!result) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">批量批改结果</p>
          <h1>任务已完成，但结果快照缺失</h1>
          <p className="hero-copy">请返回批量批改页重新提交一次班级答案 PDF 和评分标准材料。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="result-hero batch-result-hero">
        <p className="eyebrow">班级批量批改结果</p>
        <h1>老师批注风格结果已生成</h1>
        <p className="hero-copy">
          当前展示最近一次班级同题批量批改结果，包含班级总览与每一页作答的点评。
        </p>
      </section>

      {renderPageTabsAndDetail(result, {
        eyebrow: '逐页核对',
        title: '按页签查看学生答案与老师点评',
        helperText: '页签按原 PDF 页码排列，内容区默认展示最后完成的一页，方便快速验收。',
      })}
    </main>
  );
}
