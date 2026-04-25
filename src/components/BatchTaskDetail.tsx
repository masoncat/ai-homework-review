import type { BatchReviewTaskDetail } from '../../shared/types';

function toStringList(value: unknown) {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([key, entryValue]) => {
      return (
        ['strengths', 'issues', 'suggestions'].includes(key) &&
        Array.isArray(entryValue)
      );
    })
    .flatMap(([, entryValue]) => entryValue as string[]);
}

function formatTaskStatus(status: BatchReviewTaskDetail['status']) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'partial_failed':
      return '部分失败';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
  }
}

interface BatchTaskDetailProps {
  task: BatchReviewTaskDetail;
  selectedPageNo: number | null;
  onSelectPage: (pageNo: number) => void;
  onRetry?: () => void;
  retryPending?: boolean;
  backHref?: string;
  backLabel?: string;
}

export default function BatchTaskDetail({
  task,
  selectedPageNo,
  onSelectPage,
  onRetry,
  retryPending = false,
  backHref = '#/batch-review',
  backLabel = '返回任务中心',
}: BatchTaskDetailProps) {
  const selectedPage =
    task.pages.find((page) => page.pageNo === selectedPageNo) ??
    task.pages[0] ??
    null;
  const selectedResult =
    selectedPage?.result && typeof selectedPage.result === 'object'
      ? (selectedPage.result as Record<string, unknown>)
      : null;
  const detailLines = selectedResult ? toStringList(selectedResult) : [];
  const canRetry =
    task.status === 'failed' || task.status === 'partial_failed';

  return (
    <main className="page-shell">
      <section className="result-hero">
        <p className="eyebrow">批量任务详情</p>
        <h1>任务 {task.taskId.slice(0, 8)}</h1>
        <p className="hero-copy">
          当前状态：{formatTaskStatus(task.status)}，已完成 {task.processedPages}/
          {task.totalPages} 份。
        </p>
        <div className="hero-actions">
          <span className={`task-status-chip status-${task.status}`}>
            {formatTaskStatus(task.status)}
          </span>
        </div>
        <div className="hero-actions">
          {canRetry && onRetry ? (
            <button
              className="primary-button"
              type="button"
              onClick={onRetry}
              disabled={retryPending}
            >
              {retryPending ? '正在创建重试任务...' : '重试剩余未完成部分'}
            </button>
          ) : null}
          <a className="secondary-button" href={backHref}>
            {backLabel}
          </a>
        </div>
      </section>

      <section className="result-section batch-task-detail-layout">
        <div className="batch-task-detail-sidebar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">作业列表</p>
              <h2>单份作业明细</h2>
            </div>
          </div>
          <div className="batch-task-page-list">
            {task.pages.map((page) => (
              <button
                className={`batch-task-page-button${
                  page.pageNo === selectedPageNo ? ' active' : ''
                }`}
                key={page.id}
                type="button"
                onClick={() => onSelectPage(page.pageNo)}
              >
                <strong>第 {page.pageNo} 份作业</strong>
                <span>{page.summary ?? page.errorMessage ?? page.status}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="batch-task-detail-main">
          {selectedPage ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">点评结果</p>
                  <h2>{selectedPage.summary ?? `第 ${selectedPage.pageNo} 份作业`}</h2>
                </div>
                <p>{selectedPage.level ?? selectedPage.status}</p>
              </div>
              {selectedPage.answerImageUrl ? (
                <img
                  className="batch-task-answer-image"
                  src={selectedPage.answerImageUrl}
                  alt={`第 ${selectedPage.pageNo} 份作业`}
                />
              ) : null}
              <div className="batch-task-detail-grid">
                <article className="status-card">
                  <p className="eyebrow">分数</p>
                  <h3>{selectedPage.score ?? '-'}</h3>
                </article>
                <article className="status-card">
                  <p className="eyebrow">等级</p>
                  <h3>{selectedPage.level ?? selectedPage.status}</h3>
                </article>
                <article className="status-card">
                  <p className="eyebrow">结果</p>
                  <h3>{selectedPage.summary ?? selectedPage.errorMessage ?? '处理中'}</h3>
                </article>
              </div>
              <div className="advice-list">
                {detailLines.length > 0 ? (
                  detailLines.map((line) => (
                    <article className="advice-card" key={line}>
                      <p>{line}</p>
                    </article>
                  ))
                ) : (
                  <article className="advice-card">
                    <p>{selectedPage.errorMessage ?? selectedPage.status}</p>
                  </article>
                )}
              </div>
            </>
          ) : (
            <p className="helper-text">当前任务还没有页级结果。</p>
          )}
        </div>
      </section>
    </main>
  );
}
