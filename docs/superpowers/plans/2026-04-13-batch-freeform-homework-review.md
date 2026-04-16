# Batch Freeform Homework Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate mobile-first batch review flow that accepts a class PDF plus rubric material, scores each page as one student's freeform process answer, and returns per-page teacher-style comments plus a class summary.

**Architecture:** Keep the current fixed-layout objective grading flow untouched. Add a new task type and route family for batch freeform review, backed by a PDF page extraction adapter, a dedicated multimodal scoring provider, and new frontend wizard/result pages. Store uploaded source files in OSS via the existing upload path, then process batch jobs in-request for MVP with structured page-level results and a summary payload.

**Tech Stack:** Vite, React, React Router, TypeScript, Vitest, Hono, Zod, existing OSS object store, existing FC deployment, DashScope/OpenAI-compatible multimodal APIs, PDF page extraction adapter

---

## File Structure

**Create:**
- `shared/batchReview.ts`
- `shared/batchReview.test.ts`
- `api/src/lib/pdfPageExtractor.ts`
- `api/src/lib/pdfPageExtractor.test.ts`
- `api/src/lib/batchVisionProvider.ts`
- `api/src/lib/batchVisionProvider.test.ts`
- `api/src/routes/batchReview.ts`
- `api/src/routes/batchReview.test.ts`
- `src/routes/BatchReviewPage.tsx`
- `src/routes/BatchReviewPage.test.tsx`
- `src/routes/BatchReviewResultPage.tsx`
- `src/routes/BatchReviewResultPage.test.tsx`
- `src/components/BatchReviewWizard.tsx`
- `src/components/BatchSummary.tsx`

**Modify:**
- `shared/types.ts`
- `api/package.json`
- `api/src/config.ts`
- `api/src/types.ts`
- `api/src/app.ts`
- `api/src/lib/objectStore.ts`
- `api/src/routes/uploads.ts`
- `src/App.tsx`
- `src/lib/api.ts`
- `src/routes/HomePage.tsx`
- `src/routes/HomePage.test.tsx`
- `src/styles/global.css`
- `api/.env.example`
- `docs/deployment/github-pages-and-aliyun.md`
- `README.md`

**Notes on boundaries:**
- `shared/types.ts` keeps transport contracts only.
- `shared/batchReview.ts` owns summary aggregation and level normalization for batch review only.
- `api/src/lib/pdfPageExtractor.ts` is the only place allowed to know how PDF pages become images.
- `api/src/lib/batchVisionProvider.ts` owns multimodal scoring prompts and structured parsing.
- `api/src/routes/batchReview.ts` owns request validation and response assembly, not scoring details.
- `src/routes/BatchReviewPage.tsx` owns the page shell and route state.
- `src/components/BatchReviewWizard.tsx` owns the 3-step mobile wizard UI only.

### Task 1: Shared Batch Review Contracts

**Files:**
- Create: `shared/batchReview.ts`
- Test: `shared/batchReview.test.ts`
- Modify: `shared/types.ts`

- [ ] **Step 1: Write the failing shared tests**

```ts
// shared/batchReview.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildBatchReviewSummary,
  normalizeBatchReviewLevel,
} from './batchReview';

describe('normalizeBatchReviewLevel', () => {
  it('maps arbitrary model labels into the supported level set', () => {
    expect(normalizeBatchReviewLevel('达到预期')).toBe('达到预期');
    expect(normalizeBatchReviewLevel('待改进')).toBe('待提升');
    expect(normalizeBatchReviewLevel('超出预期')).toBe('超出预期');
  });
});

describe('buildBatchReviewSummary', () => {
  it('builds the class summary rows from page results', () => {
    const summary = buildBatchReviewSummary([
      {
        pageNo: 1,
        displayName: '第 1 份',
        score: 8,
        level: '达到预期',
        summary: '图示完整，但数量关系说明不够清楚',
        strengths: ['能列出两种情况'],
        issues: ['说明不够完整'],
        suggestions: ['补充变化过程'],
      },
    ]);

    expect(summary.rows).toEqual([
      {
        pageNo: 1,
        displayName: '第 1 份',
        score: 8,
        level: '达到预期',
        summary: '图示完整，但数量关系说明不够清楚',
      },
    ]);
    expect(summary.levelCounts['达到预期']).toBe(1);
  });
});
```

- [ ] **Step 2: Run the shared test to verify it fails**

Run: `npm test -- --run shared/batchReview.test.ts`
Expected: FAIL with `Cannot find module './batchReview'`

- [ ] **Step 3: Add the new shared transport types**

```ts
// shared/types.ts
export type BatchReviewLevel =
  | '超出预期'
  | '达到预期'
  | '基本达到'
  | '待提升';

export interface BatchReviewPageResult {
  pageNo: number;
  displayName: string;
  score: number;
  level: BatchReviewLevel;
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}

export interface BatchReviewSummaryRow {
  pageNo: number;
  displayName: string;
  score: number;
  level: BatchReviewLevel;
  summary: string;
}

export interface BatchReviewSummary {
  totalPages: number;
  averageScore: number;
  rows: BatchReviewSummaryRow[];
  levelCounts: Record<BatchReviewLevel, number>;
}

export interface BatchReviewResult {
  taskId: string;
  rubricObjectKey: string;
  answerPdfObjectKey: string;
  totalPages: number;
  pages: BatchReviewPageResult[];
  summary: BatchReviewSummary;
}
```

- [ ] **Step 4: Add the shared helpers**

```ts
// shared/batchReview.ts
import type {
  BatchReviewLevel,
  BatchReviewPageResult,
  BatchReviewSummary,
} from './types';

const supportedLevels: BatchReviewLevel[] = [
  '超出预期',
  '达到预期',
  '基本达到',
  '待提升',
];

export function normalizeBatchReviewLevel(input: string): BatchReviewLevel {
  if (supportedLevels.includes(input as BatchReviewLevel)) {
    return input as BatchReviewLevel;
  }

  if (input.includes('超出')) return '超出预期';
  if (input.includes('达到')) return '达到预期';
  if (input.includes('基本')) return '基本达到';
  return '待提升';
}

export function buildBatchReviewSummary(
  pages: BatchReviewPageResult[]
): BatchReviewSummary {
  const totalPages = pages.length;
  const averageScore =
    totalPages === 0
      ? 0
      : Math.round(
          (pages.reduce((sum, page) => sum + page.score, 0) / totalPages) * 10
        ) / 10;

  const levelCounts = {
    超出预期: 0,
    达到预期: 0,
    基本达到: 0,
    待提升: 0,
  } satisfies Record<BatchReviewLevel, number>;

  for (const page of pages) {
    levelCounts[page.level] += 1;
  }

  return {
    totalPages,
    averageScore,
    rows: pages.map(({ pageNo, displayName, score, level, summary }) => ({
      pageNo,
      displayName,
      score,
      level,
      summary,
    })),
    levelCounts,
  };
}
```

- [ ] **Step 5: Run the shared test to verify it passes**

Run: `npm test -- --run shared/batchReview.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/batchReview.ts shared/batchReview.test.ts
git commit -m "feat: add batch review shared contracts"
```

### Task 2: Backend Config And Batch Route Shell

**Files:**
- Modify: `api/src/config.ts`
- Modify: `api/src/types.ts`
- Modify: `api/src/app.ts`
- Create: `api/src/routes/batchReview.ts`
- Test: `api/src/routes/batchReview.test.ts`
- Modify: `api/.env.example`

- [ ] **Step 1: Write the failing route test**

```ts
// api/src/routes/batchReview.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

describe('POST /batch-review', () => {
  it('creates a batch review result from uploaded files', async () => {
    const batchReviewProvider = {
      reviewBatch: vi.fn(async () => ({
        taskId: 'batch-task-1',
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
        totalPages: 2,
        pages: [],
        summary: {
          totalPages: 2,
          averageScore: 7.5,
          rows: [],
          levelCounts: {
            超出预期: 0,
            达到预期: 1,
            基本达到: 1,
            待提升: 0,
          },
        },
      })),
    };

    const app = createApp({ batchReviewProvider });
    const response = await app.request('http://local/batch-review', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        answerPdfObjectKey: 'uploads/batch/answers.pdf',
        rubricObjectKey: 'uploads/batch/rubric.pdf',
      }),
    });

    expect(response.status).toBe(200);
    expect(batchReviewProvider.reviewBatch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm test -- --run src/routes/batchReview.test.ts`
Expected: FAIL with route/provider type errors

- [ ] **Step 3: Extend config and app bindings for the batch provider**

```ts
// api/src/config.ts
export interface AppConfig {
  // existing fields...
  batchVisionAiBaseUrl: string;
  batchVisionAiApiKey: string;
  batchVisionAiModel: string;
}

// readConfig()
batchVisionAiBaseUrl:
  env.BATCH_VISION_AI_BASE_URL ??
  env.OCR_AI_BASE_URL ??
  'https://dashscope.aliyuncs.com/compatible-mode/v1',
batchVisionAiApiKey: env.BATCH_VISION_AI_API_KEY ?? '',
batchVisionAiModel: env.BATCH_VISION_AI_MODEL ?? 'qwen-vl-max-latest',
```

```ts
// api/src/types.ts
import type { BatchReviewProvider } from './lib/batchVisionProvider.js';

export type AppBindings = {
  Variables: {
    // existing vars...
    batchReviewProvider: BatchReviewProvider;
  };
};
```

- [ ] **Step 4: Add the route shell and wire it into the app**

```ts
// api/src/routes/batchReview.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { assertRateLimit } from '../lib/rateLimit.js';
import { verifyToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const bodySchema = z.object({
  answerPdfObjectKey: z.string().trim().min(1),
  rubricObjectKey: z.string().trim().min(1),
});

const batchReviewRoute = new Hono<AppBindings>();

batchReviewRoute.post('/', async (c) => {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const session = await verifyToken(token, c.get('config'));
  await assertRateLimit(
    c.get('rateLimitStore'),
    `batch-review:${session.inviteCode}`
  );

  const body = bodySchema.parse(await c.req.json());
  const result = await c.get('batchReviewProvider').reviewBatch(body, {
    objectStoreRuntime: c.get('objectStoreRuntimeContext') ?? undefined,
  });

  return c.json(result);
});

export default batchReviewRoute;
```

```ts
// api/src/app.ts
import batchReviewRoute from './routes/batchReview.js';
import { createBatchReviewProvider } from './lib/batchVisionProvider.js';

const batchReviewProvider =
  options.batchReviewProvider ?? createBatchReviewProvider(config, objectStore);

app.use('*', async (c, next) => {
  c.set('batchReviewProvider', batchReviewProvider);
  await next();
});

app.route('/batch-review', batchReviewRoute);
```

- [ ] **Step 5: Add env defaults**

```bash
# api/.env.example
BATCH_VISION_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
BATCH_VISION_AI_API_KEY=replace-with-real-key
BATCH_VISION_AI_MODEL=qwen-vl-max-latest
```

- [ ] **Step 6: Run the route test to verify it passes**

Run: `npm test -- --run src/routes/batchReview.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/src/config.ts api/src/types.ts api/src/app.ts api/src/routes/batchReview.ts api/src/routes/batchReview.test.ts api/.env.example
git commit -m "feat: add batch review route shell"
```

### Task 3: PDF Page Extraction Adapter

**Files:**
- Create: `api/src/lib/pdfPageExtractor.ts`
- Test: `api/src/lib/pdfPageExtractor.test.ts`
- Modify: `api/package.json`

- [ ] **Step 1: Write the failing extractor test**

```ts
// api/src/lib/pdfPageExtractor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createPdfPageExtractor } from './pdfPageExtractor.js';

describe('createPdfPageExtractor', () => {
  it('renders a PDF object into per-page image objects', async () => {
    const objectStore = {
      getObjectAiInput: vi.fn(),
      getObjectBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      saveObject: vi.fn(async () => undefined),
    };
    const extractor = createPdfPageExtractor({
      objectStore: objectStore as never,
      renderPdfPages: async () => [
        { pageNo: 1, bytes: new Uint8Array([9]), contentType: 'image/png' },
      ],
    });

    const result = await extractor.extractPages({
      answerPdfObjectKey: 'uploads/batch/answers.pdf',
      outputPrefix: 'derived/batch/task-1',
    });

    expect(result).toEqual([
      {
        pageNo: 1,
        objectKey: 'derived/batch/task-1/page-1.png',
        contentType: 'image/png',
      },
    ]);
    expect(objectStore.saveObject).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the extractor test to verify it fails**

Run: `npm test -- --run src/lib/pdfPageExtractor.test.ts`
Expected: FAIL with missing module

- [ ] **Step 3: Add the package hook for the real renderer**

```json
// api/package.json
{
  "dependencies": {
    "pdfjs-dist": "^4.10.38",
    "@napi-rs/canvas": "^0.1.66"
  }
}
```

- [ ] **Step 4: Implement the extractor with an injected renderer**

```ts
// api/src/lib/pdfPageExtractor.ts
export interface ExtractedPdfPage {
  pageNo: number;
  objectKey: string;
  contentType: string;
}

export interface PdfPageExtractor {
  extractPages(input: {
    answerPdfObjectKey: string;
    outputPrefix: string;
    runtime?: ObjectStoreRuntimeContext;
  }): Promise<ExtractedPdfPage[]>;
}

export function createPdfPageExtractor({
  objectStore,
  renderPdfPages = renderPdfPagesWithPdfJs,
}: {
  objectStore: ObjectStoreWithBytes;
  renderPdfPages?: RenderPdfPages;
}): PdfPageExtractor {
  return {
    async extractPages({ answerPdfObjectKey, outputPrefix, runtime }) {
      const pdfBytes = await objectStore.getObjectBytes(answerPdfObjectKey, runtime);
      const renderedPages = await renderPdfPages(pdfBytes);

      const savedPages: ExtractedPdfPage[] = [];

      for (const page of renderedPages) {
        const objectKey = `${outputPrefix}/page-${page.pageNo}.png`;
        await objectStore.saveObject?.(objectKey, page.bytes, page.contentType, runtime);
        savedPages.push({ pageNo: page.pageNo, objectKey, contentType: page.contentType });
      }

      return savedPages;
    },
  };
}
```

- [ ] **Step 5: Run the extractor test to verify it passes**

Run: `npm test -- --run src/lib/pdfPageExtractor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/src/lib/pdfPageExtractor.ts api/src/lib/pdfPageExtractor.test.ts
git commit -m "feat: add pdf page extraction adapter"
```

### Task 4: Batch Multimodal Scoring Provider

**Files:**
- Create: `api/src/lib/batchVisionProvider.ts`
- Test: `api/src/lib/batchVisionProvider.test.ts`
- Modify: `api/src/lib/objectStore.ts`

- [ ] **Step 1: Write the failing provider test**

```ts
// api/src/lib/batchVisionProvider.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBatchReviewProvider } from './batchVisionProvider.js';

describe('createBatchReviewProvider', () => {
  it('scores each page and returns a batch result', async () => {
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        getObjectAiInput: vi
          .fn()
          .mockResolvedValueOnce('https://oss.example.com/answers.pdf')
          .mockResolvedValueOnce('https://oss.example.com/rubric.pdf')
          .mockResolvedValueOnce('https://oss.example.com/page-1.png'),
      } as never,
      {
        extractPages: vi.fn(async () => [
          { pageNo: 1, objectKey: 'derived/page-1.png', contentType: 'image/png' },
        ]),
      },
      vi.fn(async () => ({
        score: 8,
        level: '达到预期',
        summary: '图示完整，但说明不够清楚',
        strengths: ['列出了两种情况'],
        issues: ['关系说明不够完整'],
        suggestions: ['补充变化过程'],
      }))
    );

    const result = await provider.reviewBatch({
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
    });

    expect(result.totalPages).toBe(1);
    expect(result.pages[0].displayName).toBe('第 1 份');
    expect(result.summary.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the provider test to verify it fails**

Run: `npm test -- --run src/lib/batchVisionProvider.test.ts`
Expected: FAIL with missing provider

- [ ] **Step 3: Extend object store for raw byte reads**

```ts
// api/src/lib/objectStore.ts
export interface ObjectStore {
  // existing methods...
  getObjectBytes?: (
    objectKey: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<Uint8Array>;
}
```

- [ ] **Step 4: Implement the batch provider**

```ts
// api/src/lib/batchVisionProvider.ts
import { buildBatchReviewSummary, normalizeBatchReviewLevel } from '../../../shared/batchReview.js';

export interface BatchReviewProvider {
  reviewBatch(
    input: { answerPdfObjectKey: string; rubricObjectKey: string },
    options?: { objectStoreRuntime?: ObjectStoreRuntimeContext }
  ): Promise<BatchReviewResult>;
}

export function createBatchReviewProvider(
  config: Pick<AppConfig, 'batchVisionAiApiKey' | 'batchVisionAiBaseUrl' | 'batchVisionAiModel'>,
  objectStore: ObjectStore,
  pdfPageExtractor: PdfPageExtractor = createPdfPageExtractor({ objectStore: objectStore as ObjectStoreWithBytes }),
  scorePage: ScorePageFn = scoreBatchReviewPage
): BatchReviewProvider {
  return {
    async reviewBatch(input, options) {
      const pageObjects = await pdfPageExtractor.extractPages({
        answerPdfObjectKey: input.answerPdfObjectKey,
        outputPrefix: `derived/batch/${crypto.randomUUID()}`,
        runtime: options?.objectStoreRuntime,
      });

      const rubricInput = await objectStore.getObjectAiInput(
        input.rubricObjectKey,
        options?.objectStoreRuntime
      );

      const pages = [];
      for (const page of pageObjects) {
        const pageInput = await objectStore.getObjectAiInput(
          page.objectKey,
          options?.objectStoreRuntime
        );
        const scored = await scorePage(config, { pageInput, rubricInput });
        pages.push({
          pageNo: page.pageNo,
          displayName: `第 ${page.pageNo} 份`,
          score: scored.score,
          level: normalizeBatchReviewLevel(scored.level),
          summary: scored.summary,
          strengths: scored.strengths,
          issues: scored.issues,
          suggestions: scored.suggestions,
        });
      }

      return {
        taskId: crypto.randomUUID(),
        answerPdfObjectKey: input.answerPdfObjectKey,
        rubricObjectKey: input.rubricObjectKey,
        totalPages: pages.length,
        pages,
        summary: buildBatchReviewSummary(pages),
      };
    },
  };
}
```

- [ ] **Step 5: Run the provider test to verify it passes**

Run: `npm test -- --run src/lib/batchVisionProvider.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/objectStore.ts api/src/lib/batchVisionProvider.ts api/src/lib/batchVisionProvider.test.ts
git commit -m "feat: add batch multimodal scoring provider"
```

### Task 5: Frontend Wizard Page And Result Page

**Files:**
- Create: `src/components/BatchReviewWizard.tsx`
- Create: `src/components/BatchSummary.tsx`
- Create: `src/routes/BatchReviewPage.tsx`
- Create: `src/routes/BatchReviewResultPage.tsx`
- Test: `src/routes/BatchReviewPage.test.tsx`
- Test: `src/routes/BatchReviewResultPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write the failing frontend tests**

```tsx
// src/routes/BatchReviewPage.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchReviewPage from './BatchReviewPage';

describe('BatchReviewPage', () => {
  it('walks through the mobile wizard and submits a batch review task', async () => {
    const requestSession = vi.fn().mockResolvedValue({
      accessToken: 'token',
      expiresInSeconds: 7200,
    });
    const requestUploadPolicy = vi.fn()
      .mockResolvedValueOnce({ objectKey: 'uploads/answers.pdf', uploadUrl: 'https://oss.example.com', method: 'PUT', expiresInSeconds: 300, headers: {} })
      .mockResolvedValueOnce({ objectKey: 'uploads/rubric.pdf', uploadUrl: 'https://oss.example.com', method: 'PUT', expiresInSeconds: 300, headers: {} });
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const submitBatchReview = vi.fn().mockResolvedValue({
      taskId: 'batch-1',
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      totalPages: 2,
      pages: [],
      summary: { totalPages: 2, averageScore: 7.5, rows: [], levelCounts: { 超出预期: 0, 达到预期: 1, 基本达到: 1, 待提升: 0 } },
    });

    render(<BatchReviewPage requestSession={requestSession} requestUploadPolicy={requestUploadPolicy} uploadFile={uploadFile} submitBatchReview={submitBatchReview} />);

    fireEvent.change(screen.getByPlaceholderText('输入体验码'), { target: { value: 'demo-code' } });
    fireEvent.change(screen.getByLabelText('班级答案 PDF'), { target: { files: [new File(['pdf'], 'answers.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.change(screen.getByLabelText('评分标准材料'), { target: { files: [new File(['rubric'], 'rubric.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '开始批量批改' }));

    await waitFor(() => expect(submitBatchReview).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `npm test -- --run src/routes/BatchReviewPage.test.tsx src/routes/BatchReviewResultPage.test.tsx`
Expected: FAIL with missing routes/components

- [ ] **Step 3: Extend API helpers**

```ts
// src/lib/api.ts
export async function submitBatchReview(input: {
  accessToken: string;
  answerPdfObjectKey: string;
  rubricObjectKey: string;
}): Promise<BatchReviewResult> {
  const res = await fetch(resolveUrl('/batch-review'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) throw new Error('提交批量批改失败');
  return res.json();
}
```

- [ ] **Step 4: Add the routes**

```tsx
// src/App.tsx
<Route path="/batch-review" element={<BatchReviewPage />} />
<Route path="/batch-review/result/:taskId" element={<BatchReviewResultPage />} />
```

- [ ] **Step 5: Implement the wizard page and result page**

```tsx
// src/routes/BatchReviewPage.tsx
const [step, setStep] = useState<1 | 2 | 3>(1);
const [answerPdf, setAnswerPdf] = useState<File | null>(null);
const [rubricFile, setRubricFile] = useState<File | null>(null);

// on submit:
const session = await requestSession({ inviteCode, humanToken: 'pass-human-check' });
const answerPolicy = await requestUploadPolicy(session.accessToken, answerPdf.name);
await uploadFile(answerPdf, answerPolicy, session.accessToken);
const rubricPolicy = await requestUploadPolicy(session.accessToken, rubricFile.name);
await uploadFile(rubricFile, rubricPolicy, session.accessToken);
const result = await submitBatchReview({
  accessToken: session.accessToken,
  answerPdfObjectKey: answerPolicy.objectKey,
  rubricObjectKey: rubricPolicy.objectKey,
});
window.location.hash = `#/batch-review/result/${result.taskId}`;
```

```tsx
// src/routes/BatchReviewResultPage.tsx
<BatchSummary summary={result.summary} />
{result.pages.map((page) => (
  <article key={page.pageNo}>
    <h3>{page.displayName}</h3>
    <p>{page.summary}</p>
  </article>
))}
```

- [ ] **Step 6: Add mobile-first styles only for the new page**

```css
/* src/styles/global.css */
.batch-wizard {
  display: grid;
  gap: 16px;
}

.wizard-step-card {
  border-radius: 22px;
  padding: 18px;
  background: var(--panel-strong);
}

.summary-table {
  display: grid;
  gap: 10px;
}
```

- [ ] **Step 7: Run the frontend tests to verify they pass**

Run: `npm test -- --run src/routes/BatchReviewPage.test.tsx src/routes/BatchReviewResultPage.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/lib/api.ts src/routes/BatchReviewPage.tsx src/routes/BatchReviewPage.test.tsx src/routes/BatchReviewResultPage.tsx src/routes/BatchReviewResultPage.test.tsx src/components/BatchReviewWizard.tsx src/components/BatchSummary.tsx src/styles/global.css
git commit -m "feat: add batch review frontend flow"
```

### Task 6: Home Entry, Docs, And End-To-End Verification

**Files:**
- Modify: `src/routes/HomePage.tsx`
- Modify: `src/routes/HomePage.test.tsx`
- Modify: `README.md`
- Modify: `docs/deployment/github-pages-and-aliyun.md`

- [ ] **Step 1: Write the failing homepage test**

```tsx
// src/routes/HomePage.test.tsx
it('shows a separate entry for class batch review', () => {
  render(<HomePage />);
  expect(screen.getByRole('link', { name: '班级批量批改' })).toHaveAttribute(
    'href',
    '#/batch-review'
  );
});
```

- [ ] **Step 2: Run the homepage test to verify it fails**

Run: `npm test -- --run src/routes/HomePage.test.tsx`
Expected: FAIL with missing link

- [ ] **Step 3: Add the homepage entry and docs**

```tsx
// src/routes/HomePage.tsx
<a className="secondary-button" href="#/batch-review">
  班级批量批改
</a>
```

```md
<!-- README.md -->
- 新增：`#/batch-review` 支持班级单题批量批改
- 需要配置：`BATCH_VISION_AI_API_KEY`
- 推荐模型：`qwen-vl-max-latest`
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm test && npm run build && (cd api && npm test && npm run build)`
Expected: all tests PASS and both builds PASS

- [ ] **Step 5: Manual API verification**

Run:

```bash
curl -sS https://ai-homeview-api-ttzrkllbdb.cn-hangzhou.fcapp.run/health
```

Expected: `ok`

Run after deployment with a real token:

```bash
node --input-type=module -e "const auth = await fetch('https://ai-homeview-api-ttzrkllbdb.cn-hangzhou.fcapp.run/auth/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inviteCode:'demo-code',humanToken:'pass-human-check'})}); console.log(auth.status)"
```

Expected: `200`

- [ ] **Step 6: Commit**

```bash
git add src/routes/HomePage.tsx src/routes/HomePage.test.tsx README.md docs/deployment/github-pages-and-aliyun.md
git commit -m "feat: add batch review entry and docs"
```

## Self-Review

**Spec coverage**
- 独立页面、移动端向导流、逐页结果、班级汇总、rubric 输入、保留现有固定版式模式，都已有对应任务。
- 尚未纳入老师复核后台、姓名识别、多题 PDF，这与 spec 的“明确不做”一致。

**Placeholder scan**
- No `TODO` or `TBD` placeholders left in tasks.
- Each task includes file paths, test commands, and commit commands.

**Type consistency**
- Batch result contracts consistently use `BatchReviewResult`, `BatchReviewPageResult`, and `BatchReviewSummary`.
- Backend config consistently uses `batchVisionAiBaseUrl`, `batchVisionAiApiKey`, `batchVisionAiModel`.
