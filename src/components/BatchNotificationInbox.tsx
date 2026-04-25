import type { BatchReviewNotification } from '../../shared/types';
import { useState } from 'react';

interface BatchNotificationInboxProps {
  notifications: BatchReviewNotification[];
  onMarkRead?: (notificationId: string) => void;
  onOpenTask?: (taskId: string) => void;
  groupByRead?: boolean;
}

export default function BatchNotificationInbox({
  notifications,
  onMarkRead,
  onOpenTask,
  groupByRead = false,
}: BatchNotificationInboxProps) {
  const [showReadNotifications, setShowReadNotifications] = useState(false);
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const unreadNotifications = notifications.filter((item) => !item.isRead);
  const readNotifications = notifications.filter((item) => item.isRead);

  function renderNotificationList(items: BatchReviewNotification[]) {
    return items.map((notification) => (
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
    ));
  }

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

        {groupByRead ? (
          <>
            {unreadNotifications.length > 0 ? (
              <section className="batch-notification-group">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">通知分组</p>
                    <h2>未读通知</h2>
                  </div>
                  <p>优先处理的新提醒会一直显示在前面。</p>
                </div>
                <div className="batch-notification-list">
                  {renderNotificationList(unreadNotifications)}
                </div>
              </section>
            ) : null}

            {readNotifications.length > 0 ? (
              <section className="batch-notification-group">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">通知分组</p>
                    <h2>已读通知</h2>
                  </div>
                  <p>历史提醒默认折叠，避免页面过长。</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setShowReadNotifications((current) => !current)}
                  >
                    {showReadNotifications ? '收起已读通知' : '展开已读通知'}
                  </button>
                </div>
                {showReadNotifications ? (
                  <div className="batch-notification-list">
                    {renderNotificationList(readNotifications)}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : (
          renderNotificationList(notifications)
        )}
      </div>
    </section>
  );
}
