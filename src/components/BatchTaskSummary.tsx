import type { BatchReviewTaskSummary } from '../../shared/types';

export type BatchTaskFilter = 'all' | 'active' | 'failed' | 'completed';

interface BatchTaskSummaryProps {
  tasks: BatchReviewTaskSummary[];
  activeFilter: BatchTaskFilter;
  onFilterChange: (filter: BatchTaskFilter) => void;
}

export default function BatchTaskSummary({
  tasks,
  activeFilter,
  onFilterChange,
}: BatchTaskSummaryProps) {
  const activeCount = tasks.filter(
    (task) => task.status === 'queued' || task.status === 'running'
  ).length;
  const failedCount = tasks.filter(
    (task) => task.status === 'failed' || task.status === 'partial_failed'
  ).length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const cards: Array<{
    filter: BatchTaskFilter;
    eyebrow: string;
    value: number;
    detail: string;
  }> = [
    {
      filter: 'all',
      eyebrow: '最近 7 天',
      value: tasks.length,
      detail: '全部任务',
    },
    {
      filter: 'active',
      eyebrow: '进行中',
      value: activeCount,
      detail: '排队中与运行中',
    },
    {
      filter: 'failed',
      eyebrow: '需处理',
      value: failedCount,
      detail: '可新建重试任务',
    },
    {
      filter: 'completed',
      eyebrow: '已完成',
      value: completedCount,
      detail: '可查看点评',
    },
  ];

  return (
    <section className="batch-task-summary-grid" aria-label="批量任务总览">
      {cards.map((card) => (
        <button
          key={card.filter}
          className={`batch-task-stat-card ${
            activeFilter === card.filter ? 'is-active' : ''
          }`}
          type="button"
          aria-pressed={activeFilter === card.filter}
          onClick={() => onFilterChange(card.filter)}
        >
          <p className="eyebrow">{card.eyebrow}</p>
          <strong>{card.value}</strong>
          <span>{card.detail}</span>
        </button>
      ))}
    </section>
  );
}
