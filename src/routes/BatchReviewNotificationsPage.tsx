import type {
  BatchReviewNotification,
  BatchReviewTaskSummary,
  SessionResponse,
} from '../../shared/types';
import BatchNotificationInbox from '../components/BatchNotificationInbox';
import BatchReviewBottomNav from '../components/BatchReviewBottomNav';
import { useBatchReviewTaskCenter } from '../hooks/useBatchReviewTaskCenter';

export interface BatchReviewNotificationsPageProps {
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
  markBatchReviewNotificationRead?: (
    accessToken: string,
    notificationId: string
  ) => Promise<{ ok: boolean }>;
}

export default function BatchReviewNotificationsPage({
  requestSession,
  listBatchReviewTasks,
  listBatchReviewNotifications,
  markBatchReviewNotificationRead,
}: BatchReviewNotificationsPageProps) {
  const {
    notifications,
    taskCenterError,
    markNotificationRead,
  } = useBatchReviewTaskCenter({
    requestSession,
    listBatchReviewTasks,
    listBatchReviewNotifications,
    markBatchReviewNotificationRead,
  });
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <main className="page-shell page-shell--with-bottom-nav">
      <section className="hero-card batch-hero-card">
        <p className="eyebrow">班级单题批量批改</p>
        <h1>站内通知</h1>
        <p className="hero-copy">
          未读提醒优先展示，已读通知折叠收起。点开任意通知，可以直接进入对应任务详情。
        </p>
        <div className="hero-actions">
          <span className="status-chip">未读 {unreadCount} 条</span>
        </div>
      </section>

      {taskCenterError ? (
        <section className="status-card">
          <p className="eyebrow">任务中心提示</p>
          <p>{taskCenterError}</p>
        </section>
      ) : null}

      <BatchNotificationInbox
        notifications={notifications}
        groupByRead
        onMarkRead={(notificationId) => {
          void markNotificationRead(notificationId);
        }}
        onOpenTask={(taskId) => {
          const target = notifications.find((notification) => notification.taskId === taskId);

          if (target && !target.isRead) {
            void markNotificationRead(target.id);
          }

          window.location.hash = `#/batch-review/tasks/${taskId}?from=notifications`;
        }}
      />

      <BatchReviewBottomNav />
    </main>
  );
}
