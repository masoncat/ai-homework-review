import type { BatchReviewTaskSummary } from '../../shared/types';

interface BatchTaskSummaryProps {
  tasks: BatchReviewTaskSummary[];
}

export default function BatchTaskSummary({ tasks }: BatchTaskSummaryProps) {
  const runningCount = tasks.filter((task) => task.status === 'running').length;
  const failedCount = tasks.filter(
    (task) => task.status === 'failed' || task.status === 'partial_failed'
  ).length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;

  return (
    <section className="batch-task-summary-grid" aria-label="批量任务总览">
      <article className="batch-task-stat-card">
        <p className="eyebrow">最近 7 天</p>
        <strong>{tasks.length}</strong>
        <span>批量任务</span>
      </article>
      <article className="batch-task-stat-card">
        <p className="eyebrow">进行中</p>
        <strong>{runningCount}</strong>
        <span>等待完成</span>
      </article>
      <article className="batch-task-stat-card">
        <p className="eyebrow">已完成</p>
        <strong>{completedCount}</strong>
        <span>可查看点评</span>
      </article>
      <article className="batch-task-stat-card">
        <p className="eyebrow">需处理</p>
        <strong>{failedCount}</strong>
        <span>可新建重试任务</span>
      </article>
    </section>
  );
}
