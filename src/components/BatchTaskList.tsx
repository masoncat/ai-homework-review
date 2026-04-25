import type { BatchReviewTaskSummary } from '../../shared/types';

function formatTaskSummary(summary: string) {
  const trimmedSummary = summary.trim();

  if (!trimmedSummary.startsWith('{')) {
    return summary;
  }

  try {
    const parsed = JSON.parse(trimmedSummary) as Record<string, unknown>;
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

    if (rows.length === 1) {
      const firstRow = rows[0];

      if (firstRow && typeof firstRow === 'object') {
        const rowSummary = (firstRow as Record<string, unknown>).summary;

        if (typeof rowSummary === 'string' && rowSummary.trim()) {
          return rowSummary;
        }
      }
    }

    const totalPages = parsed.totalPages;
    const averageScore = parsed.averageScore;

    if (typeof totalPages === 'number' && !Number.isNaN(totalPages)) {
      if (typeof averageScore === 'number' && !Number.isNaN(averageScore)) {
        const formattedAverageScore = Number.isInteger(averageScore)
          ? String(averageScore)
          : averageScore.toFixed(1);

        return `共处理 ${totalPages} 份作业，平均分 ${formattedAverageScore}`;
      }

      return `共处理 ${totalPages} 份作业`;
    }
  } catch {
    return summary;
  }

  return summary;
}

function formatTaskStatus(status: BatchReviewTaskSummary['status']) {
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

interface BatchTaskListProps {
  tasks: BatchReviewTaskSummary[];
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onOpenTask: (taskId: string) => void;
}

export default function BatchTaskList({
  tasks,
  title = '最近 7 天的批量任务',
  description = '过程态弱化，只保留进度、状态和是否需要重试。',
  emptyTitle = '最近 7 天还没有批量任务',
  emptyDescription = '先创建一个新任务，后面这里会展示离线进度和结果总览。',
  onOpenTask,
}: BatchTaskListProps) {
  if (tasks.length === 0) {
    return (
      <section className="result-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">任务中心</p>
            <h2>{emptyTitle}</h2>
          </div>
          <p>{emptyDescription}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="result-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">任务中心</p>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>

      <div className="batch-task-list">
        {tasks.map((task) => {
          const percent =
            task.totalPages > 0
              ? Math.min(100, Math.round((task.processedPages / task.totalPages) * 100))
              : 0;

          return (
            <article className="batch-task-card" key={task.taskId}>
              <div className="batch-task-card-head">
                <div>
                  <strong>任务 {task.taskId.slice(0, 8)}</strong>
                  <p>{formatTaskSummary(task.summary)}</p>
                </div>
                <span className={`task-status-chip status-${task.status}`}>
                  {formatTaskStatus(task.status)}
                </span>
              </div>
              <div className="batch-task-progress">
                <div>
                  <span>进度</span>
                  <strong>
                    {task.processedPages}/{task.totalPages}
                  </strong>
                </div>
                <div className="batch-progress-track" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="batch-task-card-meta">
                <span>成功 {task.succeededPages}</span>
                <span>失败 {task.failedPages}</span>
                <span>{new Date(task.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onOpenTask(task.taskId)}
              >
                查看详情
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
