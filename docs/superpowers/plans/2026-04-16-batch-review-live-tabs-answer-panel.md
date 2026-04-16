# Batch Review Live Tabs Answer Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make batch-review results stream page-by-page as soon as each page finishes, and let teachers switch pages via tabs while viewing the student answer image and teacher comments together.

**Architecture:** Extend the batch-review provider so each finished page carries its answer image metadata and is emitted immediately through task snapshots. Rework the batch result page into a tabbed detail view that tracks completion order, auto-focuses the newest finished page until the user manually switches, and shows the student image beside the grading comments.

**Tech Stack:** TypeScript, React 19, React Router, Vitest, Hono, existing object store abstraction

---

## File Structure

- Modify: `shared/types.ts`
  Purpose: add answer-image metadata to batch page results so backend and frontend share the same shape.
- Modify: `api/src/lib/batchVisionProvider.ts`
  Purpose: emit immediate single-page progress updates and attach answer image URL/object key to each completed page.
- Modify: `api/src/lib/batchVisionProvider.test.ts`
  Purpose: verify immediate progress emission and answer-image metadata.
- Modify: `api/src/routes/batchReview.ts`
  Purpose: persist immediate progress snapshots as each page completes.
- Modify: `api/src/routes/batchReview.test.ts`
  Purpose: verify route snapshots preserve partial page results with image metadata.
- Modify: `src/routes/BatchReviewResultPage.tsx`
  Purpose: add tabbed page switching, latest-result auto focus, and answer-image/comment split view.
- Modify: `src/routes/BatchReviewResultPage.test.tsx`
  Purpose: verify latest-finished auto selection, manual tab lock, and image/comment rendering.
- Modify: `src/styles/global.css`
  Purpose: add mobile-first tab strip and detail panel styling.

### Task 1: Extend Batch Page Data For Answer Preview

**Files:**
- Modify: `shared/types.ts`
- Test: `api/src/lib/batchVisionProvider.test.ts`

- [ ] **Step 1: Write the failing backend test for answer-image metadata**

```ts
it('includes answer image metadata in completed page results', async () => {
  const provider = createBatchReviewProvider(
    {
      batchVisionAiApiKey: 'sk-test',
      batchVisionAiBaseUrl: 'https://example.com/v1',
      batchVisionAiModel: 'qwen-vl-max-latest',
    },
    {
      getObjectAiInput: vi
        .fn()
        .mockResolvedValueOnce('https://oss.example.com/rubric.pdf')
        .mockResolvedValueOnce('https://oss.example.com/page-1.png'),
    } as never,
    {
      extractPages: vi.fn(async () => [
        {
          pageNo: 1,
          objectKey: 'derived/page-1.png',
          contentType: 'image/png',
        },
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

  expect(result.pages[0]).toMatchObject({
    answerImageObjectKey: 'derived/page-1.png',
    answerImageUrl: 'https://oss.example.com/page-1.png',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/batchVisionProvider.test.ts`
Expected: FAIL because `answerImageObjectKey` / `answerImageUrl` are missing from batch page results.

- [ ] **Step 3: Add shared type fields and minimal provider implementation**

```ts
// shared/types.ts
export interface BatchReviewPageResult {
  pageNo: number;
  displayName: string;
  answerImageObjectKey: string;
  answerImageUrl: string;
  score: number;
  level: BatchReviewLevel;
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}

// api/src/lib/batchVisionProvider.ts inside page mapping
const pageInput = await objectStore.getObjectAiInput(
  page.objectKey,
  options?.objectStoreRuntime
);
const scored = await scorePage(config, { pageInput, rubricInput });

return {
  pageNo: page.pageNo,
  displayName: `第 ${page.pageNo} 份`,
  answerImageObjectKey: page.objectKey,
  answerImageUrl: pageInput,
  score: scored.score,
  level: normalizeBatchReviewLevel(scored.level),
  summary: scored.summary,
  strengths: scored.strengths,
  issues: scored.issues,
  suggestions: scored.suggestions,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/batchVisionProvider.test.ts`
Expected: PASS with the new metadata present on every page result.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts api/src/lib/batchVisionProvider.ts api/src/lib/batchVisionProvider.test.ts
git commit -m "feat: include answer image metadata in batch page results"
```

### Task 2: Restore Immediate Per-Page Progress Snapshots

**Files:**
- Modify: `api/src/lib/batchVisionProvider.ts`
- Modify: `api/src/routes/batchReview.ts`
- Modify: `api/src/lib/batchVisionProvider.test.ts`
- Modify: `api/src/routes/batchReview.test.ts`

- [ ] **Step 1: Write the failing test for immediate page-by-page progress**

```ts
it('emits progress as soon as each page finishes', async () => {
  const first = createDeferred<ScorePageResult>();
  const second = createDeferred<ScorePageResult>();
  const onProgress = vi.fn();

  const provider = createBatchReviewProvider(
    config,
    objectStore,
    pdfExtractorWithTwoPages,
    vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
  );

  const reviewPromise = provider.reviewBatch(input, { onProgress } as never);

  first.resolve({
    score: 8,
    level: '达到预期',
    summary: '第一页完成',
    strengths: ['优点1'],
    issues: ['问题1'],
    suggestions: ['建议1'],
  });
  await Promise.resolve();

  expect(onProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      processedPages: 1,
      totalPages: 2,
      result: expect.objectContaining({
        pages: [expect.objectContaining({ pageNo: 1 })],
      }),
    })
  );

  second.resolve({
    score: 6,
    level: '待提升',
    summary: '第二页完成',
    strengths: ['优点2'],
    issues: ['问题2'],
    suggestions: ['建议2'],
  });
  await reviewPromise;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/batchVisionProvider.test.ts src/routes/batchReview.test.ts`
Expected: FAIL because current provider batches progress and does not emit immediately on each finished page.

- [ ] **Step 3: Replace buffered progress flush with immediate progress updates**

```ts
const queueProgressUpdate = () => {
  if (!options?.onProgress) {
    return;
  }

  const pages = progressPages.filter(
    (page): page is BatchReviewPageResult => Boolean(page)
  );
  const progress: BatchReviewProgressSnapshot = {
    totalPages: pageObjects.length,
    processedPages,
    result:
      pages.length > 0
        ? buildBatchReviewResultSnapshot(input, pages)
        : undefined,
  };

  progressChain = progressChain.then(async () => {
    await options.onProgress?.(progress);
  });
};

queueProgressUpdate();

// inside page mapper after processedPages += 1
queueProgressUpdate();
```

- [ ] **Step 4: Update route test to assert partial result is persisted after first finished page**

```ts
expect(processingSnapshot).toMatchObject({
  status: 'processing',
  processedPages: 1,
  totalPages: 2,
  result: {
    pages: [
      expect.objectContaining({
        pageNo: 1,
        answerImageObjectKey: expect.any(String),
        answerImageUrl: expect.any(String),
      }),
    ],
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/lib/batchVisionProvider.test.ts src/routes/batchReview.test.ts`
Expected: PASS with immediate per-page snapshot persistence.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/batchVisionProvider.ts api/src/lib/batchVisionProvider.test.ts api/src/routes/batchReview.ts api/src/routes/batchReview.test.ts
git commit -m "feat: stream batch review progress per completed page"
```

### Task 3: Build Tabbed Answer/Image Review Panel

**Files:**
- Modify: `src/routes/BatchReviewResultPage.tsx`
- Modify: `src/routes/BatchReviewResultPage.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write the failing UI test for latest-finished auto focus and manual tab lock**

```tsx
it('auto-focuses the latest finished page until the user picks a tab', async () => {
  const initialTask: BatchReviewTaskSnapshot = {
    taskId: 'batch-2',
    status: 'processing',
    totalPages: 3,
    processedPages: 1,
    answerPdfObjectKey: 'uploads/answers.pdf',
    rubricObjectKey: 'uploads/rubric.pdf',
    createdAt: '2026-04-16T10:00:00.000Z',
    updatedAt: '2026-04-16T10:02:00.000Z',
    result: {
      taskId: 'batch-2',
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.pdf',
      totalPages: 1,
      pages: [
        {
          pageNo: 1,
          displayName: '第 1 份',
          answerImageObjectKey: 'derived/page-1.png',
          answerImageUrl: 'https://oss.example.com/page-1.png',
          score: 8,
          level: '达到预期',
          summary: '第一页已完成',
          strengths: ['步骤完整'],
          issues: ['说明略少'],
          suggestions: ['补充文字说明'],
        },
      ],
      summary: {
        totalPages: 1,
        averageScore: 8,
        rows: [
          {
            pageNo: 1,
            displayName: '第 1 份',
            score: 8,
            level: '达到预期',
            summary: '第一页已完成',
          },
        ],
        levelCounts: {
          超出预期: 0,
          达到预期: 1,
          基本达到: 0,
          待提升: 0,
        },
      },
    },
  };

  renderResultPageWithPolling(initialTask, requestBatchReviewTask);

  expect(screen.getByRole('tab', { name: '第 1 页' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  expect(screen.getByAltText('第 1 份学生答案')).toHaveAttribute(
    'src',
    'https://oss.example.com/page-1.png'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/routes/BatchReviewResultPage.test.tsx`
Expected: FAIL because the page does not render tabs or the answer image panel.

- [ ] **Step 3: Implement page tab state and selected-page detail rendering**

```tsx
const pages = result.pages;
const latestFinishedPageNo = pages.at(-1)?.pageNo ?? null;
const [selectedPageNo, setSelectedPageNo] = useState<number | null>(
  latestFinishedPageNo
);
const [hasManualTabSelection, setHasManualTabSelection] = useState(false);

useEffect(() => {
  if (!hasManualTabSelection && latestFinishedPageNo !== null) {
    setSelectedPageNo(latestFinishedPageNo);
  }
}, [hasManualTabSelection, latestFinishedPageNo]);

const selectedPage =
  pages.find((page) => page.pageNo === selectedPageNo) ?? pages.at(-1) ?? null;
```

- [ ] **Step 4: Render mobile-first tabs and answer/comment split panel**

```tsx
<div className="batch-page-tabs" role="tablist" aria-label="批量批改页签">
  {Array.from({ length: totalPages }, (_, index) => {
    const pageNo = index + 1;
    const completedPage = result.pages.find((page) => page.pageNo === pageNo);
    const selected = selectedPage?.pageNo === pageNo;

    return (
      <button
        key={pageNo}
        type="button"
        role="tab"
        aria-selected={selected}
        className={completedPage ? 'batch-page-tab done' : 'batch-page-tab pending'}
        onClick={() => {
          setHasManualTabSelection(true);
          if (completedPage) {
            setSelectedPageNo(pageNo);
          }
        }}
      >
        {`第 ${pageNo} 页`}
      </button>
    );
  })}
</div>

{selectedPage ? (
  <section className="batch-page-detail">
    <article className="batch-answer-panel">
      <img
        src={selectedPage.answerImageUrl}
        alt={`${selectedPage.displayName}学生答案`}
      />
    </article>
    <article className="batch-page-card">
      {/* existing score and comment content */}
    </article>
  </section>
) : (
  <section className="batch-page-detail empty">
    <p>当前页尚未完成批改，稍后自动更新。</p>
  </section>
)}
```

- [ ] **Step 5: Add mobile-friendly styling for the tab strip and answer panel**

```css
.batch-page-tabs {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.batch-page-tab {
  flex: 0 0 auto;
  min-width: 88px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
}

.batch-page-tab.done[aria-selected='true'] {
  background: linear-gradient(135deg, var(--accent), #f08937);
  color: #fff;
  border-color: transparent;
}

.batch-page-detail {
  display: grid;
  gap: 16px;
}

.batch-answer-panel img {
  width: 100%;
  display: block;
  border-radius: 20px;
  border: 1px solid rgba(38, 53, 77, 0.08);
  background: #fff;
}

@media (min-width: 960px) {
  .batch-page-detail {
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    align-items: start;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run src/routes/BatchReviewResultPage.test.tsx`
Expected: PASS with tabs, answer preview, latest-page auto focus, and manual selection persistence.

- [ ] **Step 7: Commit**

```bash
git add src/routes/BatchReviewResultPage.tsx src/routes/BatchReviewResultPage.test.tsx src/styles/global.css
git commit -m "feat: add live batch review tabs and answer preview panel"
```

### Task 4: Full Verification

**Files:**
- Modify: none
- Test: root and api verification commands

- [ ] **Step 1: Run frontend test suite**

Run: `npm test`
Expected: PASS for all frontend/shared tests.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`
Expected: PASS and Vite production bundle emitted.

- [ ] **Step 3: Run api test suite**

Run: `npm test`
Workdir: `api`
Expected: PASS for all API tests.

- [ ] **Step 4: Run api build**

Run: `npm run build`
Workdir: `api`
Expected: PASS and function bundle emitted.

- [ ] **Step 5: Commit final integration**

```bash
git add shared/types.ts api/src/lib/batchVisionProvider.ts api/src/lib/batchVisionProvider.test.ts api/src/routes/batchReview.ts api/src/routes/batchReview.test.ts src/routes/BatchReviewResultPage.tsx src/routes/BatchReviewResultPage.test.tsx src/styles/global.css
git commit -m "feat: stream live batch review pages with answer tabs"
```

## Self-Review

- Spec coverage: immediate result streaming is covered by Task 2; answer image metadata is covered by Task 1; page tabs and same-screen answer/comment review are covered by Task 3; verification is covered by Task 4.
- Placeholder scan: no `TODO`, `TBD`, or implicit “write tests later” instructions remain.
- Type consistency: `answerImageObjectKey` and `answerImageUrl` are introduced in Task 1 and reused consistently in later tasks; progress emission uses existing `processedPages` / `totalPages` names.
