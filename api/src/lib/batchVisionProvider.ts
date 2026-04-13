import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import {
  buildBatchReviewSummary,
  normalizeBatchReviewLevel,
} from '../../../shared/batchReview.js';
import type { BatchReviewResult } from '../../../shared/types.js';
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
    }
  ) => Promise<BatchReviewResult>;
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

function buildBatchReviewPrompt() {
  return [
    '你是小学数学老师，正在批改同一道题的学生过程题答案。',
    '第一张图片是评分标准或参考答案材料，第二张图片是某一位学生的作答页面。',
    '请综合评分标准与学生作答，输出老师批注风格结果。',
    '请只返回 JSON，格式为：',
    '{"score":8,"level":"达到预期","summary":"一句话总体评价","strengths":["优点1"],"issues":["问题1"],"suggestions":["建议1"]}',
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
    throw new Error('调用批量批改多模态模型失败');
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
      const activePdfPageExtractor =
        pdfPageExtractor ??
        createPdfPageExtractor({
          objectStore: requirePdfCapableObjectStore(objectStore),
        });

      const pageObjects = await activePdfPageExtractor.extractPages({
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
