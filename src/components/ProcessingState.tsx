type ProcessingPhase = 'idle' | 'auth' | 'upload' | 'recognize' | 'grade' | 'error';

interface ProcessingStateProps {
  phase: ProcessingPhase;
}

const steps: Array<{ key: Exclude<ProcessingPhase, 'idle' | 'error'>; label: string }> = [
  { key: 'auth', label: '标准答案已确认' },
  { key: 'upload', label: '图片上传成功' },
  { key: 'recognize', label: 'AI 正在识别题目与答案' },
  { key: 'grade', label: 'AI 正在生成判分结果和讲评' },
];

export default function ProcessingState({ phase }: ProcessingStateProps) {
  if (phase === 'idle') {
    return null;
  }

  const currentIndex = steps.findIndex((step) => step.key === phase);

  return (
    <section className="status-card" aria-live="polite">
      <p className="eyebrow">处理中</p>
      <h3>系统正在整理本次批改结果</h3>
      <p className="helper-text">通常需要 3 到 8 秒，请保持当前页面。</p>
      <ol className="status-list">
        {steps.map((step, index) => {
          const completed = currentIndex > index;
          const active = currentIndex === index;

          return (
            <li
              key={step.key}
              className={
                completed ? 'status-item completed' : active ? 'status-item active' : 'status-item'
              }
            >
              <span>{step.label}</span>
              <strong>{completed ? '已完成' : active ? '进行中' : '等待中'}</strong>
            </li>
          );
        })}
      </ol>
      {phase === 'error' ? (
        <p className="error-text">处理流程中断，请检查答案格式或稍后重试。</p>
      ) : null}
    </section>
  );
}
