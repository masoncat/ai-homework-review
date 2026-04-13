import { HashRouter, Route, Routes } from 'react-router-dom';
import BatchReviewPage from './routes/BatchReviewPage';
import BatchReviewResultPage from './routes/BatchReviewResultPage';
import HomePage from './routes/HomePage';
import ResultPage from './routes/ResultPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/batch-review" element={<BatchReviewPage />} />
        <Route
          path="/batch-review/result/:taskId"
          element={<BatchReviewResultPage />}
        />
        <Route path="/result/:taskId" element={<ResultPage />} />
      </Routes>
    </HashRouter>
  );
}
