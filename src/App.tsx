import { HashRouter, Route, Routes } from 'react-router-dom';
import HomePage from './routes/HomePage';
import ResultPage from './routes/ResultPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/result/:taskId" element={<ResultPage />} />
      </Routes>
    </HashRouter>
  );
}
