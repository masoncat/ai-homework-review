import BatchReviewBottomNav from '../components/BatchReviewBottomNav';

export default function BatchReviewNotificationsPage() {
  return (
    <main className="page-shell">
      <section className="result-hero">
        <p className="eyebrow">Batch Review</p>
        <h1>站内通知</h1>
        <p className="hero-copy">通知列表会在后续任务中迁移到这个独立页面。</p>
      </section>
      <BatchReviewBottomNav />
    </main>
  );
}
