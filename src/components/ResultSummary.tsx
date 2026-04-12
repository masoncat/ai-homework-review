import type { GradeResponse } from '../../shared/types';

interface ResultSummaryProps {
  result: GradeResponse;
}

function getStatusLabel(score: number) {
  if (score >= 95) {
    return '整体稳定';
  }

  if (score >= 80) {
    return '可重点讲评个别题';
  }

  return '建议集中复盘错题';
}

export default function ResultSummary({ result }: ResultSummaryProps) {
  const wrongItems = result.items.filter((item) => !item.isCorrect);

  return (
    <>
      <section className="result-hero">
        <p className="eyebrow">批改结果</p>
        <h1>{result.score} 分</h1>
        <p className="status-chip">{getStatusLabel(result.score)}</p>
        <p className="hero-copy">{result.summary}</p>
      </section>

      <section className="result-section">
        <div className="section-heading">
          <h2>题号正误概览</h2>
          <p>共 {result.totalCount} 题，绿色为正确，橙色为需复看。</p>
        </div>
        <div className="result-grid">
          {result.items.map((item) => (
            <span
              key={item.questionNo}
              className={item.isCorrect ? 'pill pill-ok' : 'pill pill-bad'}
            >
              {item.questionNo}
            </span>
          ))}
        </div>
      </section>

      <section className="result-section">
        <div className="section-heading">
          <h2>错题摘要</h2>
          <p>展示标准答案、识别结果和简要建议，便于老师直接复述。</p>
        </div>
        <div className="wrong-list">
          {wrongItems.length > 0 ? (
            wrongItems.map((item) => (
              <article className="wrong-card" key={item.questionNo}>
                <strong>第 {item.questionNo} 题</strong>
                <p>标准答案：{item.expectedAnswer}</p>
                <p>识别答案：{item.recognizedAnswer || '空白'}</p>
                <p>{item.feedback}</p>
              </article>
            ))
          ) : (
            <article className="wrong-card">
              <strong>本次无错题</strong>
              <p>可直接进入下一轮试拍，验证不同角度和光线下的识别稳定性。</p>
            </article>
          )}
        </div>
      </section>

      <section className="result-section">
        <div className="section-heading">
          <h2>讲评建议</h2>
          <p>按常见知识点组织，方便老师提炼课堂反馈。</p>
        </div>
        <div className="advice-list">
          {result.teachingAdvice.map((advice) => (
            <article className="advice-card" key={advice}>
              <p>{advice}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
