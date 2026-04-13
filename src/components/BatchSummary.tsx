import type { BatchReviewSummary as BatchReviewSummaryData } from '../../shared/types';

interface BatchSummaryProps {
  summary: BatchReviewSummaryData;
}

export default function BatchSummary({ summary }: BatchSummaryProps) {
  return (
    <section className="result-section batch-summary-panel">
      <div className="section-heading">
        <p className="eyebrow">班级总览</p>
        <h2>平均分 {summary.averageScore}</h2>
        <p>共处理 {summary.totalPages} 份答案，按老师批注风格输出等级和一句话问题。</p>
      </div>

      <div className="batch-summary-grid">
        <article className="summary-stat-card">
          <strong>超出预期</strong>
          <span>{summary.levelCounts['超出预期']}</span>
        </article>
        <article className="summary-stat-card">
          <strong>达到预期</strong>
          <span>{summary.levelCounts['达到预期']}</span>
        </article>
        <article className="summary-stat-card">
          <strong>基本达到</strong>
          <span>{summary.levelCounts['基本达到']}</span>
        </article>
        <article className="summary-stat-card">
          <strong>待提升</strong>
          <span>{summary.levelCounts['待提升']}</span>
        </article>
      </div>

      <div className="summary-table" aria-label="班级汇总列表">
        {summary.rows.map((row) => (
          <article className="summary-row-card" key={row.pageNo}>
            <div className="summary-row-meta">
              <strong>{row.displayName}</strong>
              <span>{row.level}</span>
            </div>
            <div className="summary-row-score">得分 {row.score}</div>
            <p>{row.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
