import ContactSection from '../components/ContactSection';
import ResultSummary from '../components/ResultSummary';
import {
  getFallbackGradeResponse,
  loadLatestGradeResponse,
} from '../lib/demoSession';

export default function ResultPage() {
  const result = loadLatestGradeResponse() ?? getFallbackGradeResponse();

  return (
    <main className="page-shell">
      <ResultSummary result={result} />

      <section className="result-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            window.location.hash = '#/';
          }}
        >
          再试一张答题卡
        </button>
        <a className="secondary-button" href="#contact">
          联系正式版
        </a>
      </section>

      <ContactSection />
    </main>
  );
}
