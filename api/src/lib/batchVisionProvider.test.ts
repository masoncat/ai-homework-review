import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatchReviewPageResult } from '../../../shared/types.js';
import { createBatchReviewProvider } from './batchVisionProvider.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBatchReviewProvider', () => {
  it('scores up to the configured page concurrency in parallel', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const resolvers: Array<() => void> = [];

    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
        getObjectAiInput: vi.fn(async (_objectKey: string) => {
          const pageMatch = _objectKey.match(/page-(\d+)/);
          return `https://oss.example.com/page-${pageMatch?.[1] ?? 'rubric'}.png`;
        }),
      } as never,
      {
        extractPages: vi.fn(async () =>
          Array.from({ length: 8 }, (_, index) => ({
            pageNo: index + 1,
            objectKey: `derived/page-${index + 1}.png`,
            contentType: 'image/png' as const,
          }))
        ),
      },
      vi.fn(
        () =>
          new Promise<{
            score: number;
            level: string;
            summary: string;
            strengths: string[];
            issues: string[];
            suggestions: string[];
          }>((resolve) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            resolvers.push(() => {
              inFlight -= 1;
              resolve({
                score: 8,
                level: '达到预期',
                summary: '已完成',
                strengths: ['优点'],
                issues: ['问题'],
                suggestions: ['建议'],
              });
            });
          })
      )
    );

    const reviewPromise = provider.reviewBatch({
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.jpeg',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maxInFlight).toBe(6);

    while (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve?.();
      await Promise.resolve();
    }

    await reviewPromise;
  });

  it('surfaces upstream model http details when the multimodal request fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '{"error":"model_not_found"}',
    }));

    vi.stubGlobal(
      'fetch',
      fetchMock as unknown as typeof fetch
    );

    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
          .mockResolvedValueOnce(new Uint8Array([4, 5, 6])),
        getObjectAiInput: vi
          .fn()
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
      }
    );

    await expect(
      provider.reviewBatch(
        {
          answerPdfObjectKey: 'uploads/answers.pdf',
          rubricObjectKey: 'uploads/rubric.pdf',
        },
        {
          objectStoreRuntime: undefined,
        } as never
      )
    ).rejects.toThrow(
      '调用批量批改多模态模型失败: HTTP 404 Not Found - model_not_found'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );
    const requestCall = (
      fetchMock.mock.calls as unknown as Array<[string, { body: string }]>
    )[0];
    expect(requestCall).toBeDefined();
    const requestInit = requestCall?.[1];
    const payload = JSON.parse(requestInit.body) as Record<string, unknown>;
    expect(payload.temperature).toBe(0);
  });

  it('extracts nested upstream error messages from the multimodal response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          '{"error":{"message":"InternalError.Algo.InvalidParameter: Failed to download multimodal content","code":"invalid_parameter_error"}}',
      })) as unknown as typeof fetch
    );

    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
          .mockResolvedValueOnce(new Uint8Array([4, 5, 6])),
        getObjectAiInput: vi
          .fn()
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
      }
    );

    await expect(
      provider.reviewBatch({
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.jpeg',
      })
    ).rejects.toThrow(
      '调用批量批改多模态模型失败: HTTP 400 Bad Request - InternalError.Algo.InvalidParameter: Failed to download multimodal content'
    );
  });

  it('emits progress as soon as each page finishes', async () => {
    const onProgress = vi.fn();
    const first = createDeferred<{
      score: number;
      level: string;
      summary: string;
      strengths: string[];
      issues: string[];
      suggestions: string[];
    }>();
    const second = createDeferred<{
      score: number;
      level: string;
      summary: string;
      strengths: string[];
      issues: string[];
      suggestions: string[];
    }>();
    const third = createDeferred<{
      score: number;
      level: string;
      summary: string;
      strengths: string[];
      issues: string[];
      suggestions: string[];
    }>();

    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([10, 11, 12]))
          .mockResolvedValueOnce(new Uint8Array([1]))
          .mockResolvedValueOnce(new Uint8Array([2]))
          .mockResolvedValueOnce(new Uint8Array([3])),
        getObjectAiInput: vi
          .fn()
          .mockResolvedValueOnce('https://oss.example.com/page-1.png')
          .mockResolvedValueOnce('https://oss.example.com/page-2.png')
          .mockResolvedValueOnce('https://oss.example.com/page-3.png'),
      } as never,
      {
        extractPages: vi.fn(async () => [
          {
            pageNo: 1,
            objectKey: 'derived/page-1.png',
            contentType: 'image/png',
          },
          {
            pageNo: 2,
            objectKey: 'derived/page-2.png',
            contentType: 'image/png',
          },
          {
            pageNo: 3,
            objectKey: 'derived/page-3.png',
            contentType: 'image/png',
          },
        ]),
      },
      vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
        .mockImplementationOnce(() => third.promise)
    );

    const reviewPromise = provider.reviewBatch(
      {
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
      },
      {
        onProgress,
      } as never
    );

    first.resolve({
      score: 8,
      level: '达到预期',
      summary: '第一页完成',
      strengths: ['优点1'],
      issues: ['问题1'],
      suggestions: ['建议1'],
    });
    second.resolve({
      score: 7,
      level: '基本达到',
      summary: '第二页完成',
      strengths: ['优点2'],
      issues: ['问题2'],
      suggestions: ['建议2'],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      onProgress.mock.calls.some(
        ([snapshot]) =>
          snapshot.processedPages >= 1 &&
          snapshot.totalPages === 3 &&
          snapshot.result?.pages.some(
            (page: BatchReviewPageResult) =>
              page.pageNo === 1 &&
              page.answerImageObjectKey === 'derived/page-1.png' &&
              page.answerImageUrl === 'https://oss.example.com/page-1.png'
          )
      )
    ).toBe(true);
    expect(
      onProgress.mock.calls.some(
        ([snapshot]) => snapshot.processedPages === 2
      )
    ).toBe(true);

    third.resolve({
      score: 6,
      level: '待提升',
      summary: '第三页完成',
      strengths: ['优点3'],
      issues: ['问题3'],
      suggestions: ['建议3'],
    });

    await reviewPromise;
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        processedPages: 3,
        totalPages: 3,
      })
    );
  });

  it('reports progress snapshots while pages are being scored', async () => {
    const onProgress = vi.fn();
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([10, 11, 12]))
          .mockResolvedValueOnce(new Uint8Array([1]))
          .mockResolvedValueOnce(new Uint8Array([2])),
        getObjectAiInput: vi
          .fn()
          .mockResolvedValueOnce('https://oss.example.com/page-1.png')
          .mockResolvedValueOnce('https://oss.example.com/page-2.png'),
      } as never,
      {
        extractPages: vi.fn(async () => [
          {
            pageNo: 1,
            objectKey: 'derived/page-1.png',
            contentType: 'image/png',
          },
          {
            pageNo: 2,
            objectKey: 'derived/page-2.png',
            contentType: 'image/png',
          },
        ]),
      },
      vi
        .fn()
        .mockResolvedValueOnce({
          score: 8,
          level: '达到预期',
          summary: '第一页完成',
          strengths: ['列出了两种情况'],
          issues: ['说明不够完整'],
          suggestions: ['补充变化过程'],
        })
        .mockResolvedValueOnce({
          score: 6,
          level: '基本达到',
          summary: '第二页完成',
          strengths: ['思路接近正确'],
          issues: ['计算有误'],
          suggestions: ['复核结果'],
        })
    );

    await provider.reviewBatch(
      {
        answerPdfObjectKey: 'uploads/answers.pdf',
        rubricObjectKey: 'uploads/rubric.pdf',
      },
      {
        onProgress,
      } as never
    );

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        totalPages: 2,
        processedPages: 0,
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        totalPages: 2,
        processedPages: 2,
        result: expect.objectContaining({
          totalPages: 2,
          pages: [
            expect.objectContaining({
              answerImageObjectKey: 'derived/page-1.png',
              answerImageUrl: 'https://oss.example.com/page-1.png',
            }),
            expect.objectContaining({
              answerImageObjectKey: 'derived/page-2.png',
              answerImageUrl: 'https://oss.example.com/page-2.png',
            }),
          ],
        }),
      })
    );
  });

  it('includes answer image metadata in completed page results', async () => {
    const getObjectBytes = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([0xff, 0xd8, 0xff]))
      .mockResolvedValueOnce(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const scorePage = vi.fn(async () => ({
      score: 8,
      level: '达到预期',
      summary: '图示完整，但说明不够清楚',
      strengths: ['列出了两种情况'],
      issues: ['关系说明不够完整'],
      suggestions: ['补充变化过程'],
    }));
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes,
        getObjectAiInput: vi
          .fn()
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
      scorePage
    );

    const result = await provider.reviewBatch({
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.jpeg',
    });

    expect(result.pages[0]).toMatchObject({
      answerImageObjectKey: 'derived/page-1.png',
      answerImageUrl: 'https://oss.example.com/page-1.png',
    });
    expect(getObjectBytes).toHaveBeenNthCalledWith(
      1,
      'uploads/rubric.jpeg',
      undefined
    );
    expect(getObjectBytes).toHaveBeenNthCalledWith(
      2,
      'derived/page-1.png',
      undefined
    );
    expect(scorePage).toHaveBeenCalledWith(
      expect.anything(),
      {
        rubricInput: 'data:image/jpeg;base64,/9j/',
        pageInput: 'data:image/png;base64,iVBORw==',
      }
    );
  });

  it('scores each page and returns a batch result', async () => {
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([10, 11, 12]))
          .mockResolvedValueOnce(new Uint8Array([1])),
        getObjectAiInput: vi
          .fn()
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

    expect(result.totalPages).toBe(1);
    expect(result.pages[0]).toMatchObject({
      displayName: '第 1 份',
      answerImageObjectKey: 'derived/page-1.png',
      answerImageUrl: 'https://oss.example.com/page-1.png',
    });
    expect(result.summary.rows).toHaveLength(1);
  });

  it('normalizes 100-point model scores back into 10-point scores', async () => {
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([10, 11, 12]))
          .mockResolvedValueOnce(new Uint8Array([1])),
        getObjectAiInput: vi
          .fn()
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
        score: 85,
        level: '达到预期',
        summary: '整体正确',
        strengths: ['步骤完整'],
        issues: ['书写略简略'],
        suggestions: ['补充说明'],
      }))
    );

    const result = await provider.reviewBatch({
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.jpeg',
    });

    expect(result.pages[0]?.score).toBe(8.5);
    expect(result.summary.averageScore).toBe(8.5);
  });

  it('rounds model scores into half-point buckets before returning results', async () => {
    const provider = createBatchReviewProvider(
      {
        batchVisionAiApiKey: 'sk-test',
        batchVisionAiBaseUrl: 'https://example.com/v1',
        batchVisionAiModel: 'qwen-vl-max-latest',
      },
      {
        saveObject: vi.fn(async () => undefined),
        getObjectBytes: vi
          .fn()
          .mockResolvedValueOnce(new Uint8Array([10, 11, 12]))
          .mockResolvedValueOnce(new Uint8Array([1])),
        getObjectAiInput: vi
          .fn()
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
        score: 8.74,
        level: '达到预期',
        summary: '整体正确',
        strengths: ['步骤完整'],
        issues: ['书写略简略'],
        suggestions: ['补充说明'],
      }))
    );

    const result = await provider.reviewBatch({
      answerPdfObjectKey: 'uploads/answers.pdf',
      rubricObjectKey: 'uploads/rubric.jpeg',
    });

    expect(result.pages[0]?.score).toBe(8.5);
    expect(result.summary.averageScore).toBe(8.5);
  });
});
