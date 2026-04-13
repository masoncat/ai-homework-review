import { startTransition, useState } from 'react';
import type {
  BatchReviewResult,
  SessionResponse,
  UploadPolicyResponse,
} from '../../shared/types';
import BatchReviewWizard from '../components/BatchReviewWizard';
import {
  requestSession as defaultRequestSession,
  requestUploadPolicy as defaultRequestUploadPolicy,
  submitBatchReview as defaultSubmitBatchReview,
  uploadFileWithPolicy as defaultUploadFile,
} from '../lib/api';
import { saveLatestBatchReviewResult } from '../lib/demoSession';
import { isApiConfigured } from '../lib/env';

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
  }) => Promise<BatchReviewResult>;
}

export default function BatchReviewPage({
  requestSession = defaultRequestSession,
  requestUploadPolicy = defaultRequestUploadPolicy,
  uploadFile = defaultUploadFile,
  submitBatchReview = defaultSubmitBatchReview,
}: BatchReviewPageProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inviteCode, setInviteCode] = useState(() => readInviteCodeFromUrl());
  const [answerPdf, setAnswerPdf] = useState<File | null>(null);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

      const result = await submitBatchReview({
        accessToken: session.accessToken,
        answerPdfObjectKey: answerPolicy.objectKey,
        rubricObjectKey: rubricPolicy.objectKey,
      });

      saveLatestBatchReviewResult(result);

      startTransition(() => {
        window.location.hash = `#/batch-review/result/${result.taskId}`;
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
    <main className="page-shell">
      <section className="hero-card batch-hero-card">
        <p className="eyebrow">班级单题批量批改</p>
        <h1>按“整班同题 PDF + 评分标准”批量给出老师批注</h1>
        <p className="hero-copy">
          保留现有固定版式批改链路不变，这个页面专门处理自由排版过程题。
          一页默认视为一位学生，系统会逐页拆图、结合 rubric 做多模态批改。
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
    </main>
  );
}
