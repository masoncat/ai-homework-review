import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { BatchReviewTaskDetail } from '../../shared/types';
import BatchTaskDetail from '../components/BatchTaskDetail';
import {
  createBatchReviewRetryTask as defaultCreateBatchReviewRetryTask,
  getBatchReviewTaskDetail as defaultGetBatchReviewTaskDetail,
} from '../lib/api';
import { loadBatchReviewAccessSession } from '../lib/demoSession';

const POLL_INTERVAL_MS = 2500;

export interface BatchReviewTaskDetailPageProps {
  accessToken?: string;
  getBatchReviewTaskDetail?: (
    accessToken: string,
    taskId: string
  ) => Promise<BatchReviewTaskDetail>;
  createBatchReviewRetryTask?: (
    accessToken: string,
    taskId: string
  ) => Promise<{ taskId: string }>;
}

export default function BatchReviewTaskDetailPage({
  accessToken = loadBatchReviewAccessSession()?.accessToken ?? '',
  getBatchReviewTaskDetail = defaultGetBatchReviewTaskDetail,
  createBatchReviewRetryTask = defaultCreateBatchReviewRetryTask,
}: BatchReviewTaskDetailPageProps) {
  const { taskId = '' } = useParams();
  const location = useLocation();
  const [task, setTask] = useState<BatchReviewTaskDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryPending, setRetryPending] = useState(false);
  const [selectedPageNo, setSelectedPageNo] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function loadTask() {
      if (!accessToken || !taskId) {
        return;
      }

      try {
        const nextTask = await getBatchReviewTaskDetail(accessToken, taskId);

        if (cancelled) {
          return;
        }

        setTask(nextTask);
        setErrorMessage('');
        setSelectedPageNo((current) => current ?? nextTask.pages[0]?.pageNo ?? null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : '获取批量任务详情失败'
        );
      }
    }

    void loadTask();

    intervalId = window.setInterval(() => {
      void loadTask();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [accessToken, getBatchReviewTaskDetail, taskId]);

  async function handleRetry() {
    if (!accessToken || !taskId) {
      return;
    }

    setRetryPending(true);

    try {
      const nextTask = await createBatchReviewRetryTask(accessToken, taskId);
      window.location.hash = `#/batch-review/tasks/${nextTask.taskId}`;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '创建重试任务失败'
      );
    } finally {
      setRetryPending(false);
    }
  }

  const detailSource = new URLSearchParams(location.search).get('from');
  const backHref =
    detailSource === 'notifications'
      ? '#/batch-review/notifications'
      : '#/batch-review';
  const backLabel =
    detailSource === 'notifications' ? '返回通知页' : '返回任务中心';

  if (!accessToken) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">批量任务详情</p>
          <h1>当前没有可用会话</h1>
          <p className="hero-copy">请先回到批量批改页，用体验码进入任务中心。</p>
        </section>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">批量任务详情</p>
          <h1>读取任务失败</h1>
          <p className="hero-copy">{errorMessage}</p>
        </section>
      </main>
    );
  }

  if (!task) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">批量任务详情</p>
          <h1>正在加载任务详情</h1>
          <p className="hero-copy">页面会自动轮询最新进度。</p>
        </section>
      </main>
    );
  }

  return (
    <BatchTaskDetail
      task={task}
      selectedPageNo={selectedPageNo}
      onSelectPage={setSelectedPageNo}
      onRetry={handleRetry}
      retryPending={retryPending}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
