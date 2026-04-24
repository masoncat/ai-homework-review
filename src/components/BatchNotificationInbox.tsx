import type { BatchReviewNotification } from '../../shared/types';

interface BatchNotificationInboxProps {
  notifications: BatchReviewNotification[];
  onMarkRead?: (notificationId: string) => void;
  onOpenTask?: (taskId: string) => void;
}

export default function BatchNotificationInbox({
  notifications,
  onMarkRead,
  onOpenTask,
}: BatchNotificationInboxProps) {
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <section className="result-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">站内通知</p>
          <h2>最近提醒</h2>
        </div>
        <p>未读 {unreadCount} 条，完成或失败后会出现在这里。</p>
      </div>

      <div className="batch-notification-list">
        {notifications.length === 0 ? (
          <p className="helper-text">当前没有新通知。</p>
        ) : null}
        {notifications.map((notification) => (
          <article className="batch-notification-card" key={notification.id}>
            <div>
              {onOpenTask ? (
                <button
                  className="inline-button"
                  type="button"
                  onClick={() => onOpenTask(notification.taskId)}
                >
                  {notification.title}
                </button>
              ) : (
                <strong>{notification.title}</strong>
              )}
              <p>{notification.message}</p>
            </div>
            <div className="batch-notification-meta">
              <span>{new Date(notification.createdAt).toLocaleString('zh-CN')}</span>
              {!notification.isRead && onMarkRead ? (
                <button
                  className="inline-button"
                  type="button"
                  onClick={() => onMarkRead(notification.id)}
                >
                  标记已读
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
