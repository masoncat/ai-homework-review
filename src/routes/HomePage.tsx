import { startTransition, useState } from 'react';
import { parseAnswerKey } from '../../shared/answerKey';
import type {
  AnswerKeyItem,
  GradeResponse,
  SessionResponse,
  UploadPolicyResponse,
} from '../../shared/types';
import AnswerKeyForm from '../components/AnswerKeyForm';
import ContactSection from '../components/ContactSection';
import HeroSection from '../components/HeroSection';
import ProcessingState from '../components/ProcessingState';
import UploadPanel from '../components/UploadPanel';
import {
  requestSession as defaultRequestSession,
  requestUploadPolicy as defaultRequestUploadPolicy,
  submitGrade as defaultSubmitGrade,
  uploadFileWithPolicy as defaultUploadFile,
} from '../lib/api';
import { saveLatestGradeResponse } from '../lib/demoSession';
import { isApiConfigured } from '../lib/env';

const demoAnswerKey =
  '1.A 2.C 3.B 4.D 5.A 6.B 7.C 8.D 9.12 10.3/4 11.18 12.24';

export interface HomePageProps {
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
  submitGrade?: (input: {
    accessToken: string;
    answerKey: string;
    objectKey: string;
  }) => Promise<GradeResponse>;
}

function readParsedItems(answerKey: string) {
  if (!answerKey.trim()) {
    return { parsedItems: [] as AnswerKeyItem[], errorMessage: '' };
  }

  try {
    return {
      parsedItems: parseAnswerKey(answerKey),
      errorMessage: '',
    };
  } catch (error) {
    return {
      parsedItems: [] as AnswerKeyItem[],
      errorMessage: error instanceof Error ? error.message : '答案格式有误',
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function HomePage({
  requestSession = defaultRequestSession,
  requestUploadPolicy = defaultRequestUploadPolicy,
  uploadFile = defaultUploadFile,
  submitGrade = defaultSubmitGrade,
}: HomePageProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'auth' | 'upload' | 'recognize' | 'grade' | 'error'
  >('idle');
  const [submitError, setSubmitError] = useState('');

  const { parsedItems, errorMessage } = readParsedItems(answerKey);
  const busy = phase !== 'idle' && phase !== 'error';
  const canUseApi =
    isApiConfigured() ||
    requestSession !== defaultRequestSession ||
    requestUploadPolicy !== defaultRequestUploadPolicy ||
    uploadFile !== defaultUploadFile ||
    submitGrade !== defaultSubmitGrade;

  async function handleStart() {
    const sourceAnswerKey = answerKey.trim() ? answerKey : demoAnswerKey;
    parseAnswerKey(sourceAnswerKey);

    if (!inviteCode.trim()) {
      setSubmitError('请先输入体验码');
      return;
    }

    if (errorMessage) {
      setSubmitError(errorMessage);
      return;
    }

    if (!selectedFile) {
      setSubmitError('请先上传答题卡图片');
      return;
    }

    setSubmitError('');

    try {
      if (!canUseApi) {
        throw new Error('当前未配置后端 API 地址');
      }

      if (!answerKey.trim()) {
        setAnswerKey(demoAnswerKey);
      }

      setPhase('auth');
      const session = await requestSession({
        inviteCode: inviteCode.trim(),
        humanToken: 'pass-human-check',
      });

      await sleep(180);
      setPhase('upload');

      const policy = await requestUploadPolicy(
        session.accessToken,
        selectedFile.name
      );
      await uploadFile(selectedFile, policy, session.accessToken);

      setPhase('recognize');
      await sleep(180);
      setPhase('grade');

      const result: GradeResponse = await submitGrade({
        accessToken: session.accessToken,
        answerKey: sourceAnswerKey,
        objectKey: policy.objectKey,
      });

      saveLatestGradeResponse(result);

      startTransition(() => {
        window.location.hash = `#/result/${result.taskId}`;
      });
    } catch (error) {
      setPhase('error');
      setSubmitError(
        error instanceof Error ? error.message : '启动体验失败，请稍后重试'
      );
    }
  }

  return (
    <main className="page-shell">
      <HeroSection />

      <section className="capability-card">
        <p className="eyebrow">能力说明</p>
        <div className="triple-grid">
          <article>
            <strong>上传固定版式答题卡</strong>
            <p>优先做固定版式，是为了控制识别稳定性和结果可信度。</p>
          </article>
          <article>
            <strong>AI 识别题号与答案</strong>
            <p>系统识别选择题与填空题答案，并保留每题置信度。</p>
          </article>
          <article>
            <strong>自动判分并生成讲评</strong>
            <p>输出总分、题号正误、错题摘要和课堂讲评建议。</p>
          </article>
        </div>
      </section>

      <section className="demo-card" id="demo">
        <p className="eyebrow">演示区</p>
        <h2>先填标准答案，再上传学生答题卡</h2>
        <p className="hero-copy">
          首页直接体验，不先跳复杂功能页。你可以先用演示答案和示例图验证完整闭环。
        </p>

        <div className="demo-layout">
          <AnswerKeyForm
            inviteCode={inviteCode}
            answerKey={answerKey}
            parsedItems={parsedItems}
            errorMessage={submitError}
            busy={busy}
            onInviteCodeChange={setInviteCode}
            onAnswerKeyChange={setAnswerKey}
            onFillDemo={() => {
              setAnswerKey(demoAnswerKey);
              setSubmitError('');
            }}
          />
          <UploadPanel
            fileName={selectedFile?.name ?? ''}
            disabled={busy}
            onFileChange={setSelectedFile}
          />
        </div>

        <section className="demo-panel start-panel">
          <div className="step-heading">
            <span className="step-index">第 3 步</span>
            <div>
              <h3 className="step-title">确认信息并开始体验</h3>
              <p className="step-copy">先上传答题卡图片，再开始体验。</p>
            </div>
          </div>
          <p className="start-hint">
            当前会按真实链路执行：签发会话、申请上传凭证、上传图片、识别答案并生成讲评。
          </p>
          <button
            className="primary-button full-width"
            type="button"
            onClick={handleStart}
            disabled={busy}
          >
            {busy ? '正在准备批改…' : '开始体验'}
          </button>
        </section>

        <ProcessingState phase={phase} />
      </section>

      <section className="boundary-card">
        <p className="eyebrow">适用边界</p>
        <div className="boundary-grid">
          <article>
            <strong>当前支持</strong>
            <p>数学选择题、数学填空题、固定版式题单或答题卡拍照上传。</p>
          </article>
          <article>
            <strong>暂不支持</strong>
            <p>自由排版手写作业本、复杂解答过程题、历史任务与老师后台。</p>
          </article>
        </div>
      </section>

      <ContactSection />
    </main>
  );
}
