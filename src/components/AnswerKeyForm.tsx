import type { AnswerKeyItem } from '../../shared/types';

interface AnswerKeyFormProps {
  inviteCode: string;
  answerKey: string;
  parsedItems: AnswerKeyItem[];
  errorMessage: string;
  busy: boolean;
  onInviteCodeChange: (value: string) => void;
  onAnswerKeyChange: (value: string) => void;
  onFillDemo: () => void;
  onStart: () => void;
}

export default function AnswerKeyForm({
  inviteCode,
  answerKey,
  parsedItems,
  errorMessage,
  busy,
  onInviteCodeChange,
  onAnswerKeyChange,
  onFillDemo,
  onStart,
}: AnswerKeyFormProps) {
  return (
    <section className="demo-panel">
      <div className="field-group">
        <label htmlFor="invite-code">体验码</label>
        <input
          id="invite-code"
          name="inviteCode"
          value={inviteCode}
          onChange={(event) => onInviteCodeChange(event.target.value)}
          placeholder="输入体验码"
          autoComplete="off"
        />
      </div>

      <div className="field-group">
        <div className="field-row">
          <label htmlFor="answer-key">标准答案</label>
          <button
            className="inline-button"
            type="button"
            onClick={onFillDemo}
            disabled={busy}
          >
            填入演示答案
          </button>
        </div>
        <textarea
          id="answer-key"
          name="answerKey"
          value={answerKey}
          onChange={(event) => onAnswerKeyChange(event.target.value)}
          rows={5}
          placeholder="可直接粘贴：1.A 2.C 3.B 4.D 5.A 6.B 7.C 8.D 9.12 10.3/4 11.18 12.24"
        />
        <p className="helper-text">建议先填写标准答案，再上传学生答题卡。</p>
        <p className="helper-text">默认格式：题号.答案，空格分隔；填空题直接写最终结果。</p>
        {parsedItems.length > 0 ? (
          <div className="tag-list" aria-label="解析后的答案">
            {parsedItems.map((item) => (
              <span className="tag" key={item.questionNo}>
                {item.questionNo}.{item.answer}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

      <button
        className="primary-button full-width"
        type="button"
        onClick={onStart}
        disabled={busy}
      >
        {busy ? '正在准备批改…' : '开始体验'}
      </button>
    </section>
  );
}
