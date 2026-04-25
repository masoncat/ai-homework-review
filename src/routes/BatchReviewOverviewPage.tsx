import { useState } from 'react';
import type {
  BatchReviewNotification,
  BatchReviewTaskSummary,
  SessionResponse,
} from '../../shared/types';
import BatchTaskList from '../components/BatchTaskList';
import BatchTaskSummary, {
  type BatchTaskFilter,
} from '../components/BatchTaskSummary';
import BatchReviewBottomNav from '../components/BatchReviewBottomNav';
import { useBatchReviewTaskCenter } from '../hooks/useBatchReviewTaskCenter';

function matchesFilter(
  task: BatchReviewTaskSummary,
  filter: BatchTaskFilter
): boolean {
  switch (filter) {
    case 'active':
      return task.status === 'queued' || task.status === 'running';
    case 'failed':
      return task.status === 'failed' || task.status === 'partial_failed';
    case 'completed':
      return task.status === 'completed';
    case 'all':
      return true;
  }
}

function getTaskListCopy(filter: BatchTaskFilter) {
  switch (filter) {
    case 'active':
      return {
        title: '进行中任务',
        description: '这里只保留排队中和运行中的任务，方便快速盯进度。',
        emptyTitle: '当前没有进行中任务',
        emptyDescription: '离线 worker 会自动推进，完成后任务会移到已完成或待处理失败。',
      };
    case 'failed':
      return {
        title: '待处理失败任务',
        description: '优先处理失败和部分失败任务，剩余部分可以新建重试子任务。',
        emptyTitle: '当前没有待处理失败任务',
        emptyDescription: '最近 7 天没有失败或部分失败的批量任务。',
      };
    case 'completed':
      return {
        title: '已完成任务',
        description: '这些任务已经可查看单份作业点评和结果明细。',
        emptyTitle: '当前没有已完成任务',
        emptyDescription: '离线批改完成后，这里会聚合最近可查看结果的任务。',
      };
    case 'all':
      return {
        title: '最近 7 天的批量任务',
        description: '过程态弱化，只保留进度、状态和是否需要重试。',
        emptyTitle: '最近 7 天还没有批量任务',
        emptyDescription: '先创建一个新任务，后面这里会展示离线进度和结果总览。',
      };
  }
}

export interface BatchReviewOverviewPageProps {
  requestSession?: (input: {
    inviteCode: string;
    humanToken: string;
  }) => Promise<SessionResponse>;
  listBatchReviewTasks?: (
    accessToken: string
  ) => Promise<BatchReviewTaskSummary[]>;
  listBatchReviewNotifications?: (
    accessToken: string
  ) => Promise<BatchReviewNotification[]>;
}

export default function BatchReviewOverviewPage({
  requestSession,
  listBatchReviewTasks,
  listBatchReviewNotifications,
}: BatchReviewOverviewPageProps) {
  const [activeFilter, setActiveFilter] = useState<BatchTaskFilter>('all');
  const { notifications, taskCenterError, taskSummaries } = useBatchReviewTaskCenter({
    requestSession,
    listBatchReviewTasks,
    listBatchReviewNotifications,
  });
  const filteredTasks = taskSummaries.filter((task) =>
    matchesFilter(task, activeFilter)
  );
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const taskListCopy = getTaskListCopy(activeFilter);

  return (
    <main className="page-shell page-shell--with-bottom-nav">
      <section className="hero-card batch-hero-card">
        <p className="eyebrow">班级单题批量批改</p>
        <h1>批量任务中心</h1>
        <p className="hero-copy">
          首页先看最近 7 天的任务概况。点击上方统计卡，可以直接切换下面的任务列表筛选。
        </p>
        <div className="hero-actions">
          <a className="secondary-button" href="#/batch-review/new">
            新建批量任务
          </a>
          <a className="secondary-button" href="#/batch-review/notifications">
            站内通知 {unreadCount > 0 ? `(${unreadCount})` : ''}
          </a>
        </div>
      </section>

      <BatchTaskSummary
        tasks={taskSummaries}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {taskCenterError ? (
        <section className="status-card">
          <p className="eyebrow">任务中心提示</p>
          <p>{taskCenterError}</p>
        </section>
      ) : null}

      <BatchTaskList
        tasks={filteredTasks}
        title={taskListCopy.title}
        description={taskListCopy.description}
        emptyTitle={taskListCopy.emptyTitle}
        emptyDescription={taskListCopy.emptyDescription}
        onOpenTask={(taskId) => {
          window.location.hash = `#/batch-review/tasks/${taskId}`;
        }}
      />

      <BatchReviewBottomNav />
    </main>
  );
}
