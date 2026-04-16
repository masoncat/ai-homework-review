import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import {
  buildBatchReviewResult,
  buildBatchReviewSummary,
  normalizeBatchReviewLevel,
  normalizeBatchReviewScore,
} from '../../../shared/batchReview.js';
import type {
  BatchReviewPageResult,
  BatchReviewResult,
} from '../../../shared/types.js';
import type { AppConfig } from '../config.js';
import type {
  ObjectStore,
  ObjectStoreRuntimeContext,
} from './objectStore.js';
import {
  createPdfPageExtractor,
  type PdfPageExtractor,
} from './pdfPageExtractor.js';

export interface BatchReviewInput {
  answerPdfObjectKey: string;
  rubricObjectKey: string;
}

export interface BatchReviewProvider {
  reviewBatch: (
    input: BatchReviewInput,
    options?: {
      objectStoreRuntime?: ObjectStoreRuntimeContext;
      pageNos?: number[];
      onProgress?: (
        progress: BatchReviewProgressSnapshot
      ) => Promise<void> | void;
    }
  ) => Promise<BatchReviewResult>;
}

const BATCH_REVIEW_PAGE_CONCURRENCY = 6;

export interface BatchReviewProgressSnapshot {
  totalPages: number;
  processedPages: number;
  result?: BatchReviewResult;
}

interface PdfCapableObjectStore extends ObjectStore {
  getObjectBytes: NonNullable<ObjectStore['getObjectBytes']>;
  saveObject: NonNullable<ObjectStore['saveObject']>;
}

interface ScorePageResult {
  score: number;
  level: string;
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}

interface ScorePageInput {
  pageInput: string;
  rubricInput: string;
}

type ScorePageFn = (
  config: Pick<
    AppConfig,
    'batchVisionAiApiKey' | 'batchVisionAiBaseUrl' | 'batchVisionAiModel'
  >,
  input: ScorePageInput,
  fetchImpl?: typeof fetch
) => Promise<ScorePageResult>;

const scorePageResponseSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).min(1),
  issues: z.array(z.string().trim().min(1)).min(1),
  suggestions: z.array(z.string().trim().min(1)).min(1),
});

function requirePdfCapableObjectStore(
  objectStore: ObjectStore
): PdfCapableObjectStore {
  if (!objectStore.getObjectBytes || !objectStore.saveObject) {
    throw new Error('当前对象存储未完成 PDF 拆页所需的读写能力配置');
  }

  return objectStore as PdfCapableObjectStore;
}

function extractJsonPayload(content: unknown) {
  if (typeof content !== 'string') {
    throw new Error('批量批改模型未返回文本结果');
  }

  const trimmed = content.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('批量批改模型返回内容不是 JSON');
  }

  return JSON.parse(match[0]);
}

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64');
}

function toAiDataUrl(bytes: Uint8Array, contentType: string) {
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

function resolveObjectContentType(
  objectKey: string,
  fallback = 'application/octet-stream'
) {
  const normalized = objectKey.toLowerCase();

  if (normalized.endsWith('.png')) {
    return 'image/png';
  }
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalized.endsWith('.pdf')) {
    return 'application/pdf';
  }

  return fallback;
}

function buildBatchReviewPrompt() {
  return [
    '你是小学数学老师，正在批改同一道题的学生过程题答案。',
    '第一张图片是评分标准或参考答案材料，第二张图片是某一位学生的作答页面。',
    '请综合评分标准与学生作答，输出老师批注风格结果。',
    '请只返回 JSON，格式为：',
    '{"score":8.5,"level":"达到预期","summary":"一句话总体评价","strengths":["优点1"],"issues":["问题1"],"suggestions":["建议1"]}',
    'score 只允许使用这些固定分值之一：0、0.5、1、1.5、2、2.5、3、3.5、4、4.5、5、5.5、6、6.5、7、7.5、8、8.5、9、9.5、10。',
    '不要输出 8.2、8.7 这类自由分值。',
    'level 只允许使用：超出预期、达到预期、基本达到、待提升。',
    'strengths/issues/suggestions 各输出 1 到 3 条，短句即可。',
  ].join('\n');
}

function assertBatchVisionConfigured(
  config: Pick<
    AppConfig,
    'batchVisionAiApiKey' | 'batchVisionAiBaseUrl' | 'batchVisionAiModel'
  >
) {
  if (!config.batchVisionAiApiKey || !config.batchVisionAiModel) {
    throw new HTTPException(503, {
      message: '批量批改能力尚未完成配置',
    });
  }
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index] as T, index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

function buildBatchReviewResultSnapshot(
  input: BatchReviewInput,
  pages: BatchReviewPageResult[]
): BatchReviewResult {
  return buildBatchReviewResult(
    {
      taskId: 'batch-review-progress',
      answerPdfObjectKey: input.answerPdfObjectKey,
      rubricObjectKey: input.rubricObjectKey,
    },
    pages
  );
}

function summarizeModelErrorPayload(payloadText: string) {
  const trimmed = payloadText.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const nestedError =
      parsed.error && typeof parsed.error === 'object'
        ? (parsed.error as Record<string, unknown>)
        : null;
    const candidate =
      parsed.message ??
      parsed.error_message ??
      parsed.detail ??
      nestedError?.message ??
      nestedError?.detail ??
      parsed.error ??
      parsed.code ??
      nestedError?.code;

    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  } catch {
    // Keep raw text fallback for non-JSON responses.
  }

  return trimmed.replace(/\s+/g, ' ').slice(0, 240);
}

async function scoreBatchReviewPage(
  config: Pick<
    AppConfig,
    'batchVisionAiApiKey' | 'batchVisionAiBaseUrl' | 'batchVisionAiModel'
  >,
  input: ScorePageInput,
  fetchImpl: typeof fetch = fetch
): Promise<ScorePageResult> {
  assertBatchVisionConfigured(config);

  const response = await fetchImpl(
    `${config.batchVisionAiBaseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.batchVisionAiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.batchVisionAiModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是严格的小学数学批改助手。只返回 JSON，不要输出 Markdown，不要解释。',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildBatchReviewPrompt() },
              {
                type: 'image_url',
                image_url: { url: input.rubricInput },
              },
              {
                type: 'image_url',
                image_url: { url: input.pageInput },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    const detail = summarizeModelErrorPayload(responseText);

    throw new Error(
      `调用批量批改多模态模型失败: HTTP ${response.status}${statusText}${
        detail ? ` - ${detail}` : ''
      }`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  return scorePageResponseSchema.parse(extractJsonPayload(content));
}

export function createBatchReviewProvider(
  config: Pick<
    AppConfig,
    'batchVisionAiApiKey' | 'batchVisionAiBaseUrl' | 'batchVisionAiModel'
  >,
  objectStore: ObjectStore,
  pdfPageExtractor?: PdfPageExtractor,
  scorePage: ScorePageFn = scoreBatchReviewPage
): BatchReviewProvider {
  return {
    async reviewBatch(input, options) {
      assertBatchVisionConfigured(config);
      const pdfCapableObjectStore = requirePdfCapableObjectStore(objectStore);
      const activePdfPageExtractor =
        pdfPageExtractor ??
        createPdfPageExtractor({
          objectStore: pdfCapableObjectStore,
        });

      const pageObjects = await activePdfPageExtractor.extractPages({
        answerPdfObjectKey: input.answerPdfObjectKey,
        outputPrefix: `derived/batch/${crypto.randomUUID()}`,
        runtime: options?.objectStoreRuntime,
      });
      const selectedPageNos = new Set(options?.pageNos ?? []);
      const selectedPageObjects =
        selectedPageNos.size > 0
          ? pageObjects.filter((page) => selectedPageNos.has(page.pageNo))
          : pageObjects;

      const rubricBytes = await pdfCapableObjectStore.getObjectBytes(
        input.rubricObjectKey,
        options?.objectStoreRuntime
      );
      const rubricAiInput = toAiDataUrl(
        rubricBytes,
        resolveObjectContentType(input.rubricObjectKey, 'image/jpeg')
      );
      const progressPages = new Array<BatchReviewPageResult | undefined>(
        selectedPageObjects.length
      );
      const completedPages: BatchReviewPageResult[] = [];
      let processedPages = 0;
      let progressChain = Promise.resolve();

      const queueProgressUpdate = () => {
        if (!options?.onProgress) {
          return;
        }
        const progress: BatchReviewProgressSnapshot = {
          totalPages: selectedPageObjects.length,
          processedPages,
          result:
            completedPages.length > 0
              ? buildBatchReviewResultSnapshot(input, completedPages)
              : undefined,
        };

        progressChain = progressChain.then(async () => {
          await options.onProgress?.(progress);
        });
      };

      queueProgressUpdate();

      const pages = await mapWithConcurrency(
        selectedPageObjects,
        BATCH_REVIEW_PAGE_CONCURRENCY,
        async (page, index) => {
          const pageDisplayUrl = await objectStore.getObjectAiInput(
            page.objectKey,
            options?.objectStoreRuntime
          );
          const pageBytes = await pdfCapableObjectStore.getObjectBytes(
            page.objectKey,
            options?.objectStoreRuntime
          );
          const pageInput = toAiDataUrl(
            pageBytes,
            resolveObjectContentType(page.objectKey, page.contentType)
          );
          const scored = await scorePage(config, {
            pageInput,
            rubricInput: rubricAiInput,
          });

          const pageResult = {
            pageNo: page.pageNo,
            displayName: `第 ${page.pageNo} 份`,
            answerImageObjectKey: page.objectKey,
            answerImageUrl: pageDisplayUrl,
            score: normalizeBatchReviewScore(scored.score),
            level: normalizeBatchReviewLevel(scored.level),
            summary: scored.summary,
            strengths: scored.strengths,
            issues: scored.issues,
            suggestions: scored.suggestions,
          };

          progressPages[index] = pageResult;
          completedPages.push(pageResult);
          processedPages += 1;
          queueProgressUpdate();

          return pageResult;
        }
      );
      await progressChain;

      return {
        taskId: crypto.randomUUID(),
        answerPdfObjectKey: input.answerPdfObjectKey,
        rubricObjectKey: input.rubricObjectKey,
        totalPages: completedPages.length,
        pages,
        summary: buildBatchReviewSummary(pages),
      };
    },
  };
}
