import { startTransition, useEffect, useState } from 'react';
import type {
  BatchReviewTaskSnapshot,
  BatchReviewTaskSummary,
  SessionResponse,
  UploadPolicyResponse,
} from '../../shared/types';
import BatchReviewBottomNav from '../components/BatchReviewBottomNav';
import BatchReviewWizard from '../components/BatchReviewWizard';
import {
  requestSession as defaultRequestSession,
  requestUploadPolicy as defaultRequestUploadPolicy,
  requestDevDefaultBatchFiles as defaultLoadDefaultBatchFiles,
  submitBatchReview as defaultSubmitBatchReview,
  uploadFileWithPolicy as defaultUploadFile,
} from '../lib/api';
import { saveBatchReviewAccessSession } from '../lib/demoSession';
import { isApiConfigured } from '../lib/env';

const INVITE_CODE_STORAGE_KEY = 'ai-homework-review:last-invite-code';

function isLegacyInlineTask(
  task: BatchReviewTaskSummary | BatchReviewTaskSnapshot
): task is BatchReviewTaskSnapshot {
  return 'answerPdfObjectKey' in task && 'rubricObjectKey' in task;
}

function readStoredInviteCode(storage: Storage = window.localStorage) {
  return storage.getItem(INVITE_CODE_STORAGE_KEY)?.trim() ?? '';
}

export interface BatchReviewNewTaskPageProps {
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
  loadDefaultBatchFiles?: () => Promise<{
    inviteCode: string;
    answerPdf: File;
    rubricFile: File;
  }>;
}

export default function BatchReviewNewTaskPage({
  requestSession = defaultRequestSession,
  requestUploadPolicy = defaultRequestUploadPolicy,
  uploadFile = defaultUploadFile,
  submitBatchReview = defaultSubmitBatchReview,
  loadDefaultBatchFiles = defaultLoadDefaultBatchFiles,
}: BatchReviewNewTaskPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inviteCode, setInviteCode] = useState(() => readStoredInviteCode());
  const [answerPdf, setAnswerPdf] = useState<File | null>(null);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    const normalizedInviteCode = inviteCode.trim();

    if (!normalizedInviteCode) {
      return;
    }

    window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, normalizedInviteCode);
  }, [inviteCode]);

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
      const normalizedInviteCode = inviteCode.trim();
      const session = await requestSession({
        inviteCode: normalizedInviteCode,
        humanToken: 'pass-human-check',
      });

      saveBatchReviewAccessSession({
        inviteCode: normalizedInviteCode,
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

  return (
    <main className="page-shell page-shell--with-bottom-nav">
      <section className="hero-card batch-hero-card">
        <p className="eyebrow">班级单题批量批改</p>
        <h1>新建批量任务</h1>
        <p className="hero-copy">
          独立任务页只保留上传、确认和提交流程，提交后直接进入任务详情。
        </p>
      </section>

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

      <BatchReviewBottomNav />
    </main>
  );
}
