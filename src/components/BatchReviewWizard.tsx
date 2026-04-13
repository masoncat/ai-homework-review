interface BatchReviewWizardProps {
  step: 1 | 2 | 3;
  inviteCode: string;
  answerPdfName: string;
  rubricFileName: string;
  busy: boolean;
  errorMessage: string;
  onInviteCodeChange: (value: string) => void;
  onAnswerPdfChange: (file: File | null) => void;
  onRubricFileChange: (file: File | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

function renderStepState(active: boolean, complete: boolean) {
  if (complete) return 'complete';
  if (active) return 'active';
  return '';
}

export default function BatchReviewWizard({
  step,
  inviteCode,
  answerPdfName,
  rubricFileName,
  busy,
  errorMessage,
  onInviteCodeChange,
  onAnswerPdfChange,
  onRubricFileChange,
  onPrev,
  onNext,
  onSubmit,
}: BatchReviewWizardProps) {
  return (
    <section className="batch-wizard">
      <div className="wizard-progress" aria-label="批量批改步骤">
        <article
          className={`wizard-step-card ${renderStepState(step === 1, step > 1)}`}
        >
          <span className="step-index">第 1 步</span>
          <h3>体验码与班级 PDF</h3>
          <p>先确认体验码，再上传班级同题答案 PDF。</p>
        </article>
        <article
          className={`wizard-step-card ${renderStepState(step === 2, step > 2)}`}
        >
          <span className="step-index">第 2 步</span>
          <h3>评分标准材料</h3>
          <p>上传老师评分标准、参考答案或 rubric 图片/PDF。</p>
        </article>
        <article
          className={`wizard-step-card ${renderStepState(step === 3, false)}`}
        >
          <span className="step-index">第 3 步</span>
          <h3>确认并提交</h3>
          <p>系统会走真实上传、拆页、识别与批改链路。</p>
        </article>
      </div>

      {step === 1 ? (
        <section className="demo-panel wizard-panel">
          <div className="field-group">
            <label htmlFor="batch-invite-code">体验码</label>
            <input
              id="batch-invite-code"
              value={inviteCode}
              placeholder="输入体验码"
              autoComplete="off"
              onChange={(event) => onInviteCodeChange(event.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="batch-answer-pdf">班级答案 PDF</label>
            <input
              id="batch-answer-pdf"
              aria-label="班级答案 PDF"
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(event) => onAnswerPdfChange(event.target.files?.[0] ?? null)}
            />
            <p className="helper-text">一页视为一位学生答案，适合“同一道题整班汇总 PDF”。</p>
            {answerPdfName ? (
              <p className="upload-name">当前已选择：{answerPdfName}</p>
            ) : null}
          </div>
          <button className="primary-button full-width" type="button" onClick={onNext}>
            下一步
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="demo-panel wizard-panel">
          <div className="field-group">
            <label htmlFor="batch-rubric-file">评分标准材料</label>
            <input
              id="batch-rubric-file"
              aria-label="评分标准材料"
              type="file"
              accept="application/pdf,image/*"
              disabled={busy}
              onChange={(event) => onRubricFileChange(event.target.files?.[0] ?? null)}
            />
            <p className="helper-text">支持图片或 PDF。推荐上传老师参考解法、评分细则或板书答案。</p>
            {rubricFileName ? (
              <p className="upload-name">当前已选择：{rubricFileName}</p>
            ) : null}
          </div>
          <div className="wizard-actions">
            <button className="secondary-button" type="button" onClick={onPrev}>
              上一步
            </button>
            <button className="primary-button" type="button" onClick={onNext}>
              下一步
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="demo-panel wizard-panel wizard-review-panel">
          <div className="batch-review-checklist">
            <article>
              <strong>体验码</strong>
              <p>{inviteCode || '未填写'}</p>
            </article>
            <article>
              <strong>班级答案 PDF</strong>
              <p>{answerPdfName || '未上传'}</p>
            </article>
            <article>
              <strong>评分标准材料</strong>
              <p>{rubricFileName || '未上传'}</p>
            </article>
          </div>
          <p className="start-hint">
            当前将执行真实链路：申请会话、上传 PDF 与 rubric、服务端拆页并逐页调用多模态模型。
          </p>
          <div className="wizard-actions">
            <button className="secondary-button" type="button" onClick={onPrev}>
              上一步
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={onSubmit}
            >
              {busy ? '正在批量批改…' : '开始批量批改'}
            </button>
          </div>
        </section>
      ) : null}

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </section>
  );
}
