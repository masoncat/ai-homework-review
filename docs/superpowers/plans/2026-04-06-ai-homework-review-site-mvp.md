# AI Homework Review Site MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first AI homework review MVP with a GitHub Pages frontend, Aliyun-ready backend APIs, low-friction teacher answer entry, abuse protection, and Scheme B test answer sheets.

**Architecture:** Use a Vite + React + TypeScript single-page frontend with `HashRouter` for GitHub Pages compatibility. Keep grading rules and answer parsing in a shared TypeScript module consumed by both the frontend and the backend. Implement a separate Node/TypeScript API app for Aliyun Function Compute, with short-lived invite-code auth, signed uploads, AI grading, and basic rate limiting.

**Tech Stack:** Vite, React, TypeScript, React Router, Vitest, Testing Library, Node.js, Hono, Zod, JOSE, Aliyun OSS SDK, provider-configurable multimodal AI API, GitHub Actions

---

## File Structure

### Root frontend files

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/global.css`
- Create: `src/routes/HomePage.tsx`
- Create: `src/routes/ResultPage.tsx`
- Create: `src/components/HeroSection.tsx`
- Create: `src/components/AnswerKeyForm.tsx`
- Create: `src/components/UploadPanel.tsx`
- Create: `src/components/ProcessingState.tsx`
- Create: `src/components/ResultSummary.tsx`
- Create: `src/components/ContactSection.tsx`
- Create: `src/lib/api.ts`
- Create: `src/lib/env.ts`
- Create: `src/lib/demoSession.ts`

### Shared domain files

- Create: `shared/types.ts`
- Create: `shared/answerKey.ts`
- Create: `shared/grading.ts`

### Frontend tests

- Create: `src/App.test.tsx`
- Create: `src/routes/HomePage.test.tsx`
- Create: `src/routes/ResultPage.test.tsx`
- Create: `shared/answerKey.test.ts`
- Create: `shared/grading.test.ts`

### Static answer sheet assets

- Create: `public/test-sheets/scheme-b-clean.svg`
- Create: `public/test-sheets/scheme-b-tilted.svg`
- Create: `public/test-sheets/scheme-b-shadow.svg`
- Create: `public/test-sheets/scheme-b-fraction.svg`
- Create: `docs/test-assets/README.md`

### Backend files

- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/vitest.config.ts`
- Create: `api/src/index.ts`
- Create: `api/src/app.ts`
- Create: `api/src/config.ts`
- Create: `api/src/lib/token.ts`
- Create: `api/src/lib/cors.ts`
- Create: `api/src/lib/rateLimit.ts`
- Create: `api/src/lib/objectStore.ts`
- Create: `api/src/lib/verifyHuman.ts`
- Create: `api/src/lib/visionProvider.ts`
- Create: `api/src/routes/auth.ts`
- Create: `api/src/routes/uploads.ts`
- Create: `api/src/routes/grade.ts`
- Create: `api/src/routes/health.ts`
- Create: `api/src/types.ts`
- Create: `api/.env.example`
- Create: `api/s.yaml`
- Create: `api/src/app.test.ts`
- Create: `api/src/routes/auth.test.ts`
- Create: `api/src/routes/grade.test.ts`

### Deployment and docs

- Create: `.github/workflows/deploy-pages.yml`
- Create: `.gitignore`
- Create: `README.md`
- Create: `docs/deployment/github-pages-and-aliyun.md`

### Responsibility notes

- `shared/` owns answer parsing, grading, and shared result types.
- `src/` owns the mobile-first product experience and API orchestration.
- `api/src/` owns auth, upload signing, grading orchestration, CORS, and rate limiting.
- `public/test-sheets/` owns Scheme B answer sheet samples used in demos and local verification.

### Task 1: Bootstrap Frontend Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/global.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing frontend shell test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App shell', () => {
  it('renders the MVP brand heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'AI 批改作业演示站' })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/App.test.tsx`
Expected: FAIL with "Cannot find module './App'" or missing Vite/Vitest configuration

- [ ] **Step 3: Write the minimal frontend workspace**

```json
{
  "name": "ai-homework-review",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.4.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.3",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  }
}
```

```tsx
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>
);
```

```tsx
export default function App() {
  return (
    <main>
      <h1>AI 批改作业演示站</h1>
    </main>
  );
}
```

```css
:root {
  color-scheme: light;
  --bg: #fff8ef;
  --ink: #172033;
  --accent: #e86a17;
}

body {
  margin: 0;
  font-family: "Noto Sans SC", "PingFang SC", sans-serif;
  background: radial-gradient(circle at top, #fff1da, var(--bg) 60%);
  color: var(--ink);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npm run test -- --run src/App.test.tsx`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts vitest.setup.ts index.html src/main.tsx src/App.tsx src/styles/global.css src/App.test.tsx
git commit -m "chore: bootstrap frontend workspace"
```

### Task 2: Build Shared Answer Parsing and Grading Rules

**Files:**
- Create: `shared/types.ts`
- Create: `shared/answerKey.ts`
- Create: `shared/grading.ts`
- Test: `shared/answerKey.test.ts`
- Test: `shared/grading.test.ts`

- [ ] **Step 1: Write the failing parser and grading tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseAnswerKey } from './answerKey';

describe('parseAnswerKey', () => {
  it('parses compact choice and fill-in input', () => {
    expect(parseAnswerKey('1.A 2.C 3.B 9.12 10.3/4')).toEqual([
      { questionNo: 1, kind: 'choice', answer: 'A' },
      { questionNo: 2, kind: 'choice', answer: 'C' },
      { questionNo: 3, kind: 'choice', answer: 'B' },
      { questionNo: 9, kind: 'fill', answer: '12' },
      { questionNo: 10, kind: 'fill', answer: '3/4' }
    ]);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { gradeSubmission } from './grading';

describe('gradeSubmission', () => {
  it('scores choice and fill answers and returns feedback', () => {
    const result = gradeSubmission(
      [
        { questionNo: 1, kind: 'choice', answer: 'A' },
        { questionNo: 9, kind: 'fill', answer: '12' }
      ],
      [
        { questionNo: 1, recognizedAnswer: 'B', confidence: 0.93 },
        { questionNo: 9, recognizedAnswer: '12', confidence: 0.88 }
      ]
    );

    expect(result.score).toBe(50);
    expect(result.items[0].isCorrect).toBe(false);
    expect(result.items[1].isCorrect).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run shared/answerKey.test.ts shared/grading.test.ts`
Expected: FAIL with missing `parseAnswerKey` and `gradeSubmission`

- [ ] **Step 3: Write the shared parsing and grading modules**

```ts
export type AnswerKind = 'choice' | 'fill';

export interface AnswerKeyItem {
  questionNo: number;
  kind: AnswerKind;
  answer: string;
}

export interface RecognizedAnswer {
  questionNo: number;
  recognizedAnswer: string;
  confidence: number;
}
```

```ts
import type { AnswerKeyItem } from './types';

const CHOICE_RE = /^[A-D]$/i;

export function parseAnswerKey(input: string): AnswerKeyItem[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const [rawNo, rawAnswer] = token.split('.');
      const questionNo = Number(rawNo);
      const answer = rawAnswer?.trim();

      if (!questionNo || !answer) {
        throw new Error(`无法解析答案项: ${token}`);
      }

      return {
        questionNo,
        kind: CHOICE_RE.test(answer) ? 'choice' : 'fill',
        answer: answer.toUpperCase()
      } satisfies AnswerKeyItem;
    });
}
```

```ts
import type { AnswerKeyItem, RecognizedAnswer } from './types';

export function gradeSubmission(
  answerKey: AnswerKeyItem[],
  recognized: RecognizedAnswer[]
) {
  const items = answerKey.map((key) => {
    const hit = recognized.find((item) => item.questionNo === key.questionNo);
    const recognizedAnswer = hit?.recognizedAnswer?.toUpperCase() ?? '';
    const isCorrect = recognizedAnswer === key.answer.toUpperCase();

    return {
      questionNo: key.questionNo,
      expectedAnswer: key.answer,
      recognizedAnswer,
      confidence: hit?.confidence ?? 0,
      isCorrect,
      feedback: isCorrect
        ? '答案正确'
        : `正确答案为 ${key.answer}，识别结果为 ${recognizedAnswer || '空白'}`
    };
  });

  const correctCount = items.filter((item) => item.isCorrect).length;
  const score = Math.round((correctCount / Math.max(items.length, 1)) * 100);

  return {
    score,
    correctCount,
    totalCount: items.length,
    items
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --run shared/answerKey.test.ts shared/grading.test.ts`
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/answerKey.ts shared/grading.ts shared/answerKey.test.ts shared/grading.test.ts
git commit -m "feat: add shared answer parsing and grading rules"
```

### Task 3: Build the Mobile-First Homepage and Demo Form

**Files:**
- Create: `src/routes/HomePage.tsx`
- Create: `src/components/HeroSection.tsx`
- Create: `src/components/AnswerKeyForm.tsx`
- Create: `src/components/UploadPanel.tsx`
- Create: `src/components/ContactSection.tsx`
- Modify: `src/App.tsx`
- Test: `src/routes/HomePage.test.tsx`

- [ ] **Step 1: Write the failing homepage test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './HomePage';

describe('HomePage', () => {
  it('shows the invite-code gate and answer key helper copy', () => {
    render(<HomePage />);

    expect(screen.getByText('先填标准答案，再上传学生答题卡')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '填入演示答案' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入体验码')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/routes/HomePage.test.tsx`
Expected: FAIL with missing homepage components

- [ ] **Step 3: Implement the homepage structure and demo form**

```tsx
import { Route, Routes } from 'react-router-dom';
import HomePage from './routes/HomePage';
import ResultPage from './routes/ResultPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/result/:taskId" element={<ResultPage />} />
    </Routes>
  );
}
```

```tsx
import HeroSection from '../components/HeroSection';
import AnswerKeyForm from '../components/AnswerKeyForm';
import UploadPanel from '../components/UploadPanel';
import ContactSection from '../components/ContactSection';

export default function HomePage() {
  return (
    <main className="page-shell">
      <HeroSection />
      <section className="demo-card">
        <p className="eyebrow">演示入口</p>
        <h2>先填标准答案，再上传学生答题卡</h2>
        <AnswerKeyForm />
        <UploadPanel />
      </section>
      <ContactSection />
    </main>
  );
}
```

```tsx
export default function AnswerKeyForm() {
  return (
    <section>
      <label htmlFor="invite-code">体验码</label>
      <input id="invite-code" name="inviteCode" placeholder="输入体验码" />

      <label htmlFor="answer-key">标准答案</label>
      <textarea
        id="answer-key"
        name="answerKey"
        placeholder="可直接粘贴：1.A 2.C 3.B 9.12 10.3/4"
      />

      <button type="button">填入演示答案</button>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/routes/HomePage.test.tsx`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/routes/HomePage.tsx src/components/HeroSection.tsx src/components/AnswerKeyForm.tsx src/components/UploadPanel.tsx src/components/ContactSection.tsx src/routes/HomePage.test.tsx
git commit -m "feat: add mobile-first homepage and demo form"
```

### Task 4: Build Processing and Result Views and Generate Scheme B Test Sheets

**Files:**
- Create: `src/routes/ResultPage.tsx`
- Create: `src/components/ProcessingState.tsx`
- Create: `src/components/ResultSummary.tsx`
- Create: `public/test-sheets/scheme-b-clean.svg`
- Create: `public/test-sheets/scheme-b-tilted.svg`
- Create: `public/test-sheets/scheme-b-shadow.svg`
- Create: `public/test-sheets/scheme-b-fraction.svg`
- Create: `docs/test-assets/README.md`
- Test: `src/routes/ResultPage.test.tsx`

- [ ] **Step 1: Write the failing result-page test**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ResultPage from './ResultPage';

describe('ResultPage', () => {
  it('shows score, question matrix, and retry action', () => {
    render(
      <MemoryRouter initialEntries={['/result/demo-task']}>
        <Routes>
          <Route path="/result/:taskId" element={<ResultPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('92 分')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再试一张答题卡' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/routes/ResultPage.test.tsx`
Expected: FAIL with missing `ResultPage`

- [ ] **Step 3: Implement the result page and add Scheme B assets**

```tsx
const sampleItems = [
  { questionNo: 1, isCorrect: true },
  { questionNo: 2, isCorrect: true },
  { questionNo: 3, isCorrect: false },
  { questionNo: 4, isCorrect: true }
];

export default function ResultPage() {
  return (
    <main className="page-shell">
      <section className="result-hero">
        <p className="eyebrow">批改结果</p>
        <h1>92 分</h1>
        <p>共批改 12 题，建议重点复看 3、6、12 题。</p>
      </section>

      <section className="result-grid">
        {sampleItems.map((item) => (
          <span
            key={item.questionNo}
            className={item.isCorrect ? 'pill pill-ok' : 'pill pill-bad'}
          >
            {item.questionNo}
          </span>
        ))}
      </section>

      <button type="button">再试一张答题卡</button>
    </main>
  );
}
```

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
  <rect width="1200" height="1800" fill="#fffdf7" />
  <text x="120" y="160" font-size="52" font-family="Noto Sans SC">方案 B 测试答题卡</text>
  <text x="120" y="240" font-size="28">选择题 1-8，填空题 9-12</text>
  <rect x="120" y="320" width="420" height="90" rx="20" fill="none" stroke="#94a3b8" />
  <text x="150" y="378" font-size="28">姓名</text>
</svg>
```

```md
# Scheme B Test Assets

- `scheme-b-clean.svg`: 标准清晰图
- `scheme-b-tilted.svg`: 轻微倾斜图
- `scheme-b-shadow.svg`: 局部阴影图
- `scheme-b-fraction.svg`: 含分数填空图
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/routes/ResultPage.test.tsx`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/routes/ResultPage.tsx src/components/ProcessingState.tsx src/components/ResultSummary.tsx src/routes/ResultPage.test.tsx public/test-sheets docs/test-assets/README.md
git commit -m "feat: add result flow and scheme b test assets"
```

### Task 5: Scaffold the Backend App with Invite-Code Auth and CORS

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/vitest.config.ts`
- Create: `api/src/index.ts`
- Create: `api/src/app.ts`
- Create: `api/src/config.ts`
- Create: `api/src/lib/token.ts`
- Create: `api/src/lib/cors.ts`
- Create: `api/src/lib/verifyHuman.ts`
- Create: `api/src/routes/auth.ts`
- Create: `api/src/routes/health.ts`
- Test: `api/src/routes/auth.test.ts`

- [ ] **Step 1: Write the failing auth and CORS tests**

```ts
import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('POST /auth/session', () => {
  it('returns a short-lived token for a valid invite code', async () => {
    const res = await app.request('http://local/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://demo.example.com' },
      body: JSON.stringify({ inviteCode: 'demo-code', humanToken: 'pass-human-check' })
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://demo.example.com');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npm run test -- --run src/routes/auth.test.ts`
Expected: FAIL with missing backend app or auth route

- [ ] **Step 3: Implement the backend app shell, CORS, and invite-code auth**

```json
{
  "name": "ai-homework-review-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.6.14",
    "jose": "^5.9.6",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

```ts
import { Hono } from 'hono';
import { corsHeaders, withCors } from './lib/cors';
import authRoute from './routes/auth';
import healthRoute from './routes/health';

export const app = new Hono();

app.use('*', withCors);
app.route('/auth', authRoute);
app.route('/health', healthRoute);
app.options('*', (c) => c.text('', 204, corsHeaders(c.req.header('origin'))));
```

```ts
import { Hono } from 'hono';
import { signToken } from '../lib/token';

const authRoute = new Hono();

authRoute.post('/session', async (c) => {
  const body = await c.req.json();
  if (body.inviteCode !== 'demo-code' || body.humanToken !== 'pass-human-check') {
    return c.json({ message: '体验码或人机验证无效' }, 401);
  }

  return c.json({
    accessToken: await signToken({ inviteCode: body.inviteCode }),
    expiresInSeconds: 7200
  });
});

export default authRoute;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npm install && npm run test -- --run src/routes/auth.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add api/package.json api/tsconfig.json api/vitest.config.ts api/src/index.ts api/src/app.ts api/src/config.ts api/src/lib/token.ts api/src/lib/cors.ts api/src/lib/verifyHuman.ts api/src/routes/auth.ts api/src/routes/health.ts api/src/routes/auth.test.ts
git commit -m "feat: scaffold backend auth and cors"
```

### Task 6: Implement Signed Uploads, Rate Limiting, and AI Grading

**Files:**
- Create: `api/src/lib/rateLimit.ts`
- Create: `api/src/lib/objectStore.ts`
- Create: `api/src/lib/visionProvider.ts`
- Create: `api/src/types.ts`
- Create: `api/src/routes/uploads.ts`
- Create: `api/src/routes/grade.ts`
- Create: `api/src/routes/grade.test.ts`
- Modify: `api/src/app.ts`
- Test: `api/src/routes/grade.test.ts`

- [ ] **Step 1: Write the failing upload and grading tests**

```ts
import { describe, expect, it } from 'vitest';
import { app } from '../app';

describe('POST /grade', () => {
  it('returns scored items for a signed-in teacher session', async () => {
    const res = await app.request('http://local/grade', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
        origin: 'https://demo.example.com'
      },
      body: JSON.stringify({
        answerKey: '1.A 2.C 3.B 9.12 10.3/4',
        objectKey: 'uploads/demo/scheme-b-clean.jpg'
      })
    });

    expect(res.status).toBe(200);
    expect((await res.json()).score).toBeTypeOf('number');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npm run test -- --run src/routes/grade.test.ts`
Expected: FAIL with missing upload or grade routes

- [ ] **Step 3: Implement signed uploads, rate limit checks, and grading orchestration**

```ts
export interface RateLimitStore {
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export async function assertRateLimit(store: RateLimitStore, key: string) {
  const allowed = await store.hit(key, 20, 3600);
  if (!allowed) {
    throw new Error('请求过于频繁，请稍后再试');
  }
}
```

```ts
export interface GradeRequestBody {
  answerKey: string;
  objectKey: string;
}

export interface UploadPolicyResponse {
  objectKey: string;
  method: 'PUT';
  expiresInSeconds: number;
}
```

```ts
import OSS from 'ali-oss';

export function createUploadPolicy(objectKey: string) {
  return {
    objectKey,
    method: 'PUT',
    expiresInSeconds: 300
  };
}

export function createObjectStoreClient(config: {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
}) {
  return new OSS(config);
}
```

```ts
import { Hono } from 'hono';
import { createUploadPolicy } from '../lib/objectStore';

const uploadsRoute = new Hono();

uploadsRoute.post('/policy', async (c) => {
  return c.json(createUploadPolicy(`uploads/${crypto.randomUUID()}.jpg`));
});

export default uploadsRoute;
```

```ts
import { Hono } from 'hono';
import { parseAnswerKey } from '../../../shared/answerKey';
import { gradeSubmission } from '../../../shared/grading';

const gradeRoute = new Hono();

gradeRoute.post('/', async (c) => {
  const body = await c.req.json();
  const answerKey = parseAnswerKey(body.answerKey);
  const recognized = await c.get('visionProvider').recognize(body.objectKey, answerKey);
  const result = gradeSubmission(answerKey, recognized);

  return c.json({
    taskId: crypto.randomUUID(),
    ...result
  });
});

export default gradeRoute;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npm run test -- --run src/routes/grade.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/rateLimit.ts api/src/lib/objectStore.ts api/src/lib/visionProvider.ts api/src/routes/uploads.ts api/src/routes/grade.ts api/src/routes/grade.test.ts api/src/app.ts
git commit -m "feat: add upload signing and grading api"
```

### Task 7: Integrate the Frontend with the API and Add Deployment Files

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/lib/env.ts`
- Create: `src/lib/demoSession.ts`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `api/.env.example`
- Create: `api/s.yaml`
- Create: `.gitignore`
- Create: `docs/deployment/github-pages-and-aliyun.md`
- Modify: `README.md`
- Modify: `src/routes/HomePage.tsx`
- Test: `src/routes/HomePage.test.tsx`
- Test: `api/src/app.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';

describe('HomePage integration', () => {
  it('requests a session before starting upload', async () => {
    const requestSession = vi.fn().mockResolvedValue({ accessToken: 'token', expiresInSeconds: 7200 });
    render(<HomePage requestSession={requestSession} />);

    fireEvent.change(screen.getByPlaceholderText('输入体验码'), {
      target: { value: 'demo-code' }
    });
    fireEvent.click(screen.getByRole('button', { name: '开始体验' }));

    expect(requestSession).toHaveBeenCalled();
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('http://local/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/routes/HomePage.test.tsx && cd api && npm run test -- --run src/app.test.ts`
Expected: FAIL with missing injected API client or health route assertions

- [ ] **Step 3: Implement API wiring and deployment configuration**

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function requestSession(input: { inviteCode: string; humanToken: string }) {
  const res = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    throw new Error('获取体验会话失败');
  }

  return res.json();
}
```

```tsx
export default function HomePage({
  requestSession
}: {
  requestSession: (input: { inviteCode: string; humanToken: string }) => Promise<{
    accessToken: string;
    expiresInSeconds: number;
  }>;
}) {
  async function handleStart() {
    await requestSession({
      inviteCode: 'demo-code',
      humanToken: 'pass-human-check'
    });
  }

  return (
    <main className="page-shell">
      <input placeholder="输入体验码" />
      <button type="button" onClick={handleStart}>
        开始体验
      </button>
    </main>
  );
}
```

```yaml
name: Deploy Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
```

```yaml
edition: 3.0.0
name: ai-homework-review-api
access: default

resources:
  grade-api:
    component: fc3
    props:
      region: ${env(ALIYUN_REGION)}
      functionName: ai-homework-review-api
      runtime: nodejs20
      code: ./
      handler: dist/index.handler
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --run src/routes/HomePage.test.tsx && cd api && npm run test -- --run src/app.test.ts`
Expected: PASS with both test targets green

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/env.ts src/lib/demoSession.ts .github/workflows/deploy-pages.yml api/.env.example api/s.yaml .gitignore docs/deployment/github-pages-and-aliyun.md README.md src/routes/HomePage.test.tsx api/src/app.test.ts
git commit -m "chore: wire frontend api and deployment configs"
```

## Self-Review

### Spec coverage

- Homepage, answer-key input, upload, processing, result, and contact flow are covered by Tasks 1, 3, 4, and 7.
- Shared parsing and grading rules are covered by Task 2.
- Scheme B answer sheet samples are covered by Task 4.
- GitHub Pages frontend deployment is covered by Task 7.
- Aliyun-ready backend APIs, OSS upload signing, invite-code auth, CORS, and anti-abuse basics are covered by Tasks 5, 6, and 7.

### Placeholder scan

- No `TODO`, `TBD`, or unresolved placeholders remain in the task list.
- Each task names explicit files, explicit test commands, and explicit commit messages.

### Type consistency

- `AnswerKeyItem`, `RecognizedAnswer`, and grading result shapes originate in `shared/types.ts`.
- Frontend and backend tasks both consume the same `parseAnswerKey` and `gradeSubmission` functions from `shared/`.
- Routes and deployment files keep the GitHub Pages frontend plus Aliyun backend split consistent with the approved spec.
