import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  BatchReviewNotification,
  BatchReviewTaskSummary,
  SessionResponse,
} from '../../shared/types';
import {
  listBatchReviewNotifications as defaultListBatchReviewNotifications,
  listBatchReviewTasks as defaultListBatchReviewTasks,
  markBatchReviewNotificationRead as defaultMarkBatchReviewNotificationRead,
  requestSession as defaultRequestSession,
} from '../lib/api';
import {
  clearBatchReviewAccessSession,
  loadBatchReviewAccessSession,
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

function readInitialInviteCode() {
  const inviteCodeFromUrl = readInviteCodeFromUrl();

  if (inviteCodeFromUrl) {
    return inviteCodeFromUrl;
  }

  const storedInviteCode = readStoredInviteCode();

  if (storedInviteCode) {
    return storedInviteCode;
  }

  return loadBatchReviewAccessSession()?.inviteCode ?? '';
}

function readInitialAccessSession(inviteCode: string) {
  const savedSession = loadBatchReviewAccessSession();

  if (!savedSession) {
    return {
      accessToken: '',
      inviteCode: '',
    };
  }

  if (inviteCode.trim() && savedSession.inviteCode !== inviteCode.trim()) {
    return {
      accessToken: '',
      inviteCode: '',
    };
  }

  return {
    accessToken: savedSession.accessToken,
    inviteCode: savedSession.inviteCode,
  };
}

export interface UseBatchReviewTaskCenterOptions {
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

export interface UseBatchReviewTaskCenterResult {
  accessToken: string;
  inviteCode: string;
  notifications: BatchReviewNotification[];
  taskCenterError: string;
  taskSummaries: BatchReviewTaskSummary[];
  toastMessage: string;
  clearToastMessage: () => void;
  markNotificationRead: (notificationId: string) => Promise<void>;
  setInviteCode: Dispatch<SetStateAction<string>>;
  setTaskCenterAccessSession: (accessToken: string, inviteCode?: string) => void;
}

export function useBatchReviewTaskCenter({
  requestSession = defaultRequestSession,
  listBatchReviewTasks = defaultListBatchReviewTasks,
  listBatchReviewNotifications = defaultListBatchReviewNotifications,
  markBatchReviewNotificationRead = defaultMarkBatchReviewNotificationRead,
}: UseBatchReviewTaskCenterOptions = {}): UseBatchReviewTaskCenterResult {
  const [inviteCode, setInviteCode] = useState(() => readInitialInviteCode());
  const [initialAccessSession] = useState(() =>
    readInitialAccessSession(readInitialInviteCode())
  );
  const [accessToken, setAccessToken] = useState(initialAccessSession.accessToken);
  const [accessTokenInviteCode, setAccessTokenInviteCode] = useState(
    initialAccessSession.inviteCode
  );
  const [taskSummaries, setTaskSummaries] = useState<BatchReviewTaskSummary[]>([]);
  const [notifications, setNotifications] = useState<BatchReviewNotification[]>([]);
  const [taskCenterError, setTaskCenterError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const trimmedInviteCode = inviteCode.trim();
  const hasActiveAccessToken =
    accessToken.length > 0 && accessTokenInviteCode === trimmedInviteCode;

  function clearTaskCenterAccessSession() {
    clearBatchReviewAccessSession();
    setAccessToken('');
    setAccessTokenInviteCode('');
  }

  useEffect(() => {
    if (!trimmedInviteCode) {
      return;
    }

    window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, trimmedInviteCode);
  }, [trimmedInviteCode]);

  useEffect(() => {
    if (!trimmedInviteCode) {
      clearTaskCenterAccessSession();
      return;
    }

    const savedSession = loadBatchReviewAccessSession();

    if (savedSession?.inviteCode === trimmedInviteCode) {
      setAccessToken(savedSession.accessToken);
      setAccessTokenInviteCode(savedSession.inviteCode);
      return;
    }

    if (accessTokenInviteCode && accessTokenInviteCode !== trimmedInviteCode) {
      clearTaskCenterAccessSession();
    }
  }, [accessTokenInviteCode, trimmedInviteCode]);

  useEffect(() => {
    let cancelled = false;

    async function ensureTaskCenterSession() {
      if (!trimmedInviteCode || !isApiConfigured() || hasActiveAccessToken) {
        return;
      }

      try {
        const session = await requestSession({
          inviteCode: trimmedInviteCode,
          humanToken: 'pass-human-check',
        });

        if (cancelled) {
          return;
        }

        saveBatchReviewAccessSession({
          inviteCode: trimmedInviteCode,
          accessToken: session.accessToken,
        });
        setAccessToken(session.accessToken);
        setAccessTokenInviteCode(trimmedInviteCode);
        setTaskCenterError('');
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
  }, [hasActiveAccessToken, requestSession, trimmedInviteCode]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function loadTaskCenterData() {
      if (!hasActiveAccessToken) {
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

        const authError =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          (error.status === 401 || error.status === 403);

        if (authError) {
          clearTaskCenterAccessSession();
        }

        setTaskCenterError(
          error instanceof Error ? error.message : '获取任务中心数据失败'
        );
      }
    }

    void loadTaskCenterData();

    if (hasActiveAccessToken) {
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
  }, [
    accessToken,
    hasActiveAccessToken,
    listBatchReviewNotifications,
    listBatchReviewTasks,
  ]);

  async function markNotificationRead(notificationId: string) {
    if (!hasActiveAccessToken) {
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

  function setTaskCenterAccessSession(
    nextAccessToken: string,
    nextInviteCode = trimmedInviteCode
  ) {
    const normalizedInviteCode = nextInviteCode.trim();

    if (!normalizedInviteCode || !nextAccessToken) {
      clearTaskCenterAccessSession();
      return;
    }

    saveBatchReviewAccessSession({
      inviteCode: normalizedInviteCode,
      accessToken: nextAccessToken,
    });
    setAccessToken(nextAccessToken);
    setAccessTokenInviteCode(normalizedInviteCode);
    setTaskCenterError('');
  }

  return {
    accessToken: hasActiveAccessToken ? accessToken : '',
    inviteCode,
    notifications,
    taskCenterError,
    taskSummaries,
    toastMessage,
    clearToastMessage: () => setToastMessage(''),
    markNotificationRead,
    setInviteCode,
    setTaskCenterAccessSession,
  };
}
