import { useParams } from 'react-router-dom';
import type { BatchReviewResult } from '../../shared/types';
import BatchSummary from '../components/BatchSummary';
import { loadLatestBatchReviewResult } from '../lib/demoSession';

interface BatchReviewResultPageProps {
  loadResult?: (taskId: string) => BatchReviewResult | null;
}

export default function BatchReviewResultPage({
  loadResult = () => loadLatestBatchReviewResult(),
}: BatchReviewResultPageProps) {
  const { taskId = '' } = useParams();
  const result = loadResult(taskId);

  if (!result) {
    return (
      <main className="page-shell">
        <section className="result-hero">
          <p className="eyebrow">批量批改结果</p>
          <h1>当前还没有可展示的批改结果</h1>
          <p className="hero-copy">请返回批量批改页重新提交一次班级答案 PDF 和评分标准材料。</p>
          <div className="result-actions">
            <a className="primary-button" href="#/batch-review">
              返回批量批改
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="result-hero batch-result-hero">
        <p className="eyebrow">班级批量批改结果</p>
        <h1>老师批注风格结果已生成</h1>
        <p className="hero-copy">
          当前展示最近一次班级同题批量批改结果，包含班级总览与每一页作答的点评。
        </p>
      </section>

      <BatchSummary summary={result.summary} />

      <section className="result-section">
        <div className="section-heading">
          <p className="eyebrow">逐页点评</p>
          <h2>每位学生的批注摘要</h2>
        </div>
        <div className="batch-result-list">
          {result.pages.map((page) => (
            <article className="batch-page-card" key={page.pageNo}>
              <div className="batch-page-head">
                <div>
                  <h3>{page.displayName}</h3>
                  <p>{page.summary}</p>
                </div>
                <div className="batch-page-score">
                  <strong>{page.score}</strong>
                  <span>{page.level}</span>
                </div>
              </div>
              <div className="batch-comment-grid">
                <section>
                  <strong>做得好的地方</strong>
                  <ul>
                    {page.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <strong>主要问题</strong>
                  <ul>
                    {page.issues.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <strong>改进建议</strong>
                  <ul>
                    {page.suggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
