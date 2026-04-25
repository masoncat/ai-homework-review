import BatchReviewBottomNav from '../components/BatchReviewBottomNav';

export default function BatchReviewOverviewPage() {
  return (
    <main className="page-shell">
      <section className="result-hero">
        <p className="eyebrow">Batch Review</p>
        <h1>批量任务中心</h1>
        <p className="hero-copy">任务中心首页正在拆分为独立移动端路由。</p>
      </section>
      <BatchReviewBottomNav />
    </main>
  );
}
