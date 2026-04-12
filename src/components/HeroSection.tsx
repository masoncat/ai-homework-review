export default function HeroSection() {
  function scrollToSection(sectionId: string) {
    const target = document.getElementById(sectionId);

    if (!target || typeof target.scrollIntoView !== 'function') {
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <section className="hero-card">
      <p className="eyebrow">固定版式数学作业演示</p>
      <h1>AI 批改作业演示站</h1>
      <p className="hero-copy">
        面向老师的移动端优先演示页。先录入标准答案，再上传固定版式题单，
        系统给出识别、判分和讲评建议。
      </p>
      <div className="hero-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => scrollToSection('demo')}
        >
          立即体验批改演示
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => scrollToSection('contact')}
        >
          添加微信咨询
        </button>
      </div>
      <ul className="hero-points" aria-label="适用范围">
        <li>支持数学选择题与填空题</li>
        <li>优先固定版式答题卡与题单</li>
        <li>不承诺自由排版与解答过程题</li>
      </ul>
    </section>
  );
}
