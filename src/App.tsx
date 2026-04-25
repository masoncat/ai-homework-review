import { HashRouter, Route, Routes } from 'react-router-dom';
import BatchReviewPage from './routes/BatchReviewPage';
import BatchReviewNewTaskPage from './routes/BatchReviewNewTaskPage';
import BatchReviewNotificationsPage from './routes/BatchReviewNotificationsPage';
import BatchReviewOverviewPage from './routes/BatchReviewOverviewPage';
import BatchReviewResultPage from './routes/BatchReviewResultPage';
import BatchReviewTaskDetailPage from './routes/BatchReviewTaskDetailPage';
import HomePage from './routes/HomePage';
import ResultPage from './routes/ResultPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/batch-review" element={<BatchReviewOverviewPage />} />
        <Route path="/batch-review/new" element={<BatchReviewNewTaskPage />} />
        <Route
          path="/batch-review/notifications"
          element={<BatchReviewNotificationsPage />}
        />
        <Route
          path="/batch-review/tasks/:taskId"
          element={<BatchReviewTaskDetailPage />}
        />
        <Route
          path="/batch-review/result/:taskId"
          element={<BatchReviewResultPage />}
        />
        <Route path="/batch-review/legacy" element={<BatchReviewPage />} />
        <Route path="/result/:taskId" element={<ResultPage />} />
      </Routes>
    </HashRouter>
  );
}
