import { startTransition, useEffect, useRef, useState } from 'react';
import type {
  BatchReviewNotification,
  BatchReviewTaskSnapshot,
  BatchReviewTaskSummary,
  SessionResponse,
  UploadPolicyResponse,
} from '../../shared/types';
import BatchNotificationInbox from '../components/BatchNotificationInbox';
import BatchTaskList from '../components/BatchTaskList';
import BatchTaskSummary from '../components/BatchTaskSummary';
import BatchReviewWizard from '../components/BatchReviewWizard';
import {
  listBatchReviewNotifications as defaultListBatchReviewNotifications,
  listBatchReviewTasks as defaultListBatchReviewTasks,
  markBatchReviewNotificationRead as defaultMarkBatchReviewNotificationRead,
  requestSession as defaultRequestSession,
  requestUploadPolicy as defaultRequestUploadPolicy,
  requestDevDefaultBatchFiles as defaultLoadDefaultBatchFiles,
  submitBatchReview as defaultSubmitBatchReview,
  uploadFileWithPolicy as defaultUploadFile,
} from '../lib/api';
import {
  saveBatchReviewAccessSession,
} from '../lib/demoSession';
import { isApiConfigured } from '../lib/env';

const INVITE_CODE_STORAGE_KEY = 'ai-homework-review:last-invite-code';
const TASK_CENTER_POLL_INTERVAL_MS = 5000;

function readInviteCodeFromUrl(location: Location = window.location) {
  const pageQueryInviteCode = new URLSearchParams(location.search)
    .get('inviteCode')
    ?.trim();

  if (pageQueryInviteCode) {
    return pageQueryInviteCode;
  }

  const queryIndex = location.hash.indexOf('?');

  if (queryIndex === -1) {
    return '';
  }

  return (
    new URLSearchParams(location.hash.slice(queryIndex + 1))
      .get('inviteCode')
      ?.trim() ?? ''
  );
}

function readStoredInviteCode(storage: Storage = window.localStorage) {
  return storage.getItem(INVITE_CODE_STORAGE_KEY)?.trim() ?? '';
}

function isLegacyInlineTask(
  task: BatchReviewTaskSummary | BatchReviewTaskSnapshot
): task is BatchReviewTaskSnapshot {
  return 'answerPdfObjectKey' in task && 'rubricObjectKey' in task;
}

export interface BatchReviewPageProps {
  requestSession?: (input: {
    inviteCode: string;
    humanToken: string;
  }) => Promise<SessionResponse>;
  requestUploadPolicy?: (
    accessToken: string,
    fileName: string
  ) => Promise<UploadPolicyResponse>;
  uploadFile?: (
    file: File,
    policy: UploadPolicyResponse,
    accessToken?: string
  ) => Promise<void>;
  submitBatchReview?: (input: {
    accessToken: string;
    answerPdfObjectKey: string;
    rubricObjectKey: string;
  }) => Promise<BatchReviewTaskSummary | BatchReviewTaskSnapshot>;
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
  loadDefaultBatchFiles?: () => Promise<{
    inviteCode: string;
    answerPdf: File;
    rubricFile: File;
  }>;
}

export default function BatchReviewPage({
  requestSession = defaultRequestSession,
  requestUploadPolicy = defaultRequestUploadPolicy,
  uploadFile = defaultUploadFile,
  submitBatchReview = defaultSubmitBatchReview,
  listBatchReviewTasks = defaultListBatchReviewTasks,
  listBatchReviewNotifications = defaultListBatchReviewNotifications,
  markBatchReviewNotificationRead = defaultMarkBatchReviewNotificationRead,
  loadDefaultBatchFiles = defaultLoadDefaultBatchFiles,
}: BatchReviewPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inviteCode, setInviteCode] = useState(() => {
    const inviteCodeFromUrl = readInviteCodeFromUrl();

    return inviteCodeFromUrl || readStoredInviteCode();
  });
  const [answerPdf, setAnswerPdf] = useState<File | null>(null);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [taskCenterError, setTaskCenterError] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [taskSummaries, setTaskSummaries] = useState<BatchReviewTaskSummary[]>([]);
  const [notifications, setNotifications] = useState<BatchReviewNotification[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!inviteCode.trim()) {
      return;
    }

    window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, inviteCode.trim());
  }, [inviteCode]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDefaultBatchFiles() {
      try {
        const defaults = await loadDefaultBatchFiles();

        if (cancelled) {
          return;
        }

        setInviteCode((currentValue) =>
          currentValue.trim() ? currentValue : defaults.inviteCode
        );
        setAnswerPdf((currentFile) => currentFile ?? defaults.answerPdf);
        setRubricFile((currentFile) => currentFile ?? defaults.rubricFile);
      } catch {
        // Local-dev convenience only. Ignore when fixtures are unavailable.
      }
    }

    void hydrateDefaultBatchFiles();

    return () => {
      cancelled = true;
    };
  }, [loadDefaultBatchFiles]);

  useEffect(() => {
    let cancelled = false;

    async function ensureTaskCenterSession() {
      if (!inviteCode.trim() || !isApiConfigured()) {
        return;
      }

      try {
        const session = await requestSession({
          inviteCode: inviteCode.trim(),
          humanToken: 'pass-human-check',
        });

        if (cancelled) {
          return;
        }

        setAccessToken(session.accessToken);
        saveBatchReviewAccessSession({
          inviteCode: inviteCode.trim(),
          accessToken: session.accessToken,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setTaskCenterError(
          error instanceof Error ? error.message : '获取任务中心会话失败'
        );
      }
    }

    void ensureTaskCenterSession();

    return () => {
      cancelled = true;
    };
  }, [inviteCode, requestSession]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function loadTaskCenterData() {
      if (!accessToken) {
        return;
      }

      try {
        const [nextTasks, nextNotifications] = await Promise.all([
          listBatchReviewTasks(accessToken),
          listBatchReviewNotifications(accessToken),
        ]);

        if (cancelled) {
          return;
        }

        setTaskSummaries(nextTasks);
        setNotifications(nextNotifications);
        setTaskCenterError('');

        const unreadNew = nextNotifications.find(
          (item) => !item.isRead && !seenNotificationIdsRef.current.has(item.id)
        );

        if (unreadNew) {
          setToastMessage(unreadNew.message);
        }

        seenNotificationIdsRef.current = new Set(
          nextNotifications.map((item) => item.id)
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setTaskCenterError(
          error instanceof Error ? error.message : '获取任务中心数据失败'
        );
      }
    }

    void loadTaskCenterData();

    if (accessToken) {
      intervalId = window.setInterval(() => {
        void loadTaskCenterData();
      }, TASK_CENTER_POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [accessToken, listBatchReviewNotifications, listBatchReviewTasks]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage('');
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const canUseApi =
    isApiConfigured() ||
    requestSession !== defaultRequestSession ||
    requestUploadPolicy !== defaultRequestUploadPolicy ||
    uploadFile !== defaultUploadFile ||
    submitBatchReview !== defaultSubmitBatchReview;

  function handleNext() {
    if (step === 1) {
      if (!inviteCode.trim()) {
        setErrorMessage('请先输入体验码');
        return;
      }
      if (!answerPdf) {
        setErrorMessage('请先上传班级答案 PDF');
        return;
      }
      setErrorMessage('');
      setStep(2);
      return;
    }

    if (!rubricFile) {
      setErrorMessage('请先上传评分标准材料');
      return;
    }

    setErrorMessage('');
    setStep(3);
  }

  async function handleSubmit() {
    if (!inviteCode.trim()) {
      setErrorMessage('请先输入体验码');
      return;
    }
    if (!answerPdf) {
      setErrorMessage('请先上传班级答案 PDF');
      return;
    }
    if (!rubricFile) {
      setErrorMessage('请先上传评分标准材料');
      return;
    }

    if (!canUseApi) {
      setErrorMessage('当前未配置后端 API 地址');
      return;
    }

    setBusy(true);
    setErrorMessage('');

    try {
      const session = await requestSession({
        inviteCode: inviteCode.trim(),
        humanToken: 'pass-human-check',
      });

      setAccessToken(session.accessToken);
      saveBatchReviewAccessSession({
        inviteCode: inviteCode.trim(),
        accessToken: session.accessToken,
      });

      const answerPolicy = await requestUploadPolicy(
        session.accessToken,
        answerPdf.name
      );
      await uploadFile(answerPdf, answerPolicy, session.accessToken);

      const rubricPolicy = await requestUploadPolicy(
        session.accessToken,
        rubricFile.name
      );
      await uploadFile(rubricFile, rubricPolicy, session.accessToken);

      const task = await submitBatchReview({
        accessToken: session.accessToken,
        answerPdfObjectKey: answerPolicy.objectKey,
        rubricObjectKey: rubricPolicy.objectKey,
      });

      startTransition(() => {
        window.location.hash = isLegacyInlineTask(task)
          ? `#/batch-review/result/${task.taskId}`
          : `#/batch-review/tasks/${task.taskId}`;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '批量批改失败，请稍后重试'
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    if (!accessToken) {
      return;
    }

    try {
      await markBatchReviewNotificationRead(accessToken, notificationId);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item
        )
      );
    } catch (error) {
      setTaskCenterError(
        error instanceof Error ? error.message : '更新通知状态失败'
      );
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card batch-hero-card">
        <p className="eyebrow">班级单题批量批改</p>
        <h1>任务中心先看总览，再点开单份作业点评</h1>
        <p className="hero-copy">
          批量批改已经改成离线任务模式。页面主视图聚焦最近 7 天任务、站内通知和可重试任务，新建任务折叠在下方。
        </p>
        <div className="hero-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
          >
            {showCreateForm ? '收起新建任务' : '新建批量任务'}
          </button>
        </div>
        {toastMessage ? <p className="batch-toast">{toastMessage}</p> : null}
      </section>

      <BatchTaskSummary tasks={taskSummaries} />

      {taskCenterError ? (
        <section className="status-card">
          <p className="eyebrow">任务中心提示</p>
          <p>{taskCenterError}</p>
        </section>
      ) : null}

      <BatchTaskList
        tasks={taskSummaries}
        onOpenTask={(taskId) => {
          window.location.hash = `#/batch-review/tasks/${taskId}`;
        }}
      />

      <BatchNotificationInbox
        notifications={notifications}
        onMarkRead={handleMarkNotificationRead}
        onOpenTask={(taskId) => {
          window.location.hash = `#/batch-review/tasks/${taskId}`;
        }}
      />

      {showCreateForm ? (
        <BatchReviewWizard
          step={step}
          inviteCode={inviteCode}
          answerPdfName={answerPdf?.name ?? ''}
          rubricFileName={rubricFile?.name ?? ''}
          busy={busy}
          errorMessage={errorMessage}
          onInviteCodeChange={setInviteCode}
          onAnswerPdfChange={setAnswerPdf}
          onRubricFileChange={setRubricFile}
          onPrev={() => {
            setErrorMessage('');
            setStep((currentStep) => (currentStep === 3 ? 2 : 1));
          }}
          onNext={handleNext}
          onSubmit={handleSubmit}
        />
      ) : null}
    </main>
  );
}
