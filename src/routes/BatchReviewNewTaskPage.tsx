import BatchReviewBottomNav from '../components/BatchReviewBottomNav';

export default function BatchReviewNewTaskPage() {
  return (
    <main className="page-shell">
      <section className="result-hero">
        <p className="eyebrow">Batch Review</p>
        <h1>新建批量任务</h1>
        <p className="hero-copy">新建任务流程会在后续任务中迁移到这个独立页面。</p>
      </section>
      <BatchReviewBottomNav />
    </main>
  );
}
