import { describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '../lib/objectStore.js';
import { attachObjectStoreRuntimeContext } from '../lib/runtimeContext.js';
import { createApp } from '../app.js';

describe('POST /grade', () => {
  it('returns scored items for a signed-in teacher session', async () => {
    const objectStore = createMemoryObjectStore();
    await objectStore.saveObject!(
      'uploads/demo/scheme-b-clean.jpg',
      new Uint8Array([1, 2, 3]),
      'image/jpeg'
    );
    const app = createApp({
      objectStore,
      visionProvider: {
        recognize: async () => [
          { questionNo: 1, recognizedAnswer: 'B', confidence: 0.93 },
          { questionNo: 2, recognizedAnswer: 'C', confidence: 0.95 },
          { questionNo: 3, recognizedAnswer: 'B', confidence: 0.94 },
          { questionNo: 9, recognizedAnswer: '12', confidence: 0.88 },
          { questionNo: 10, recognizedAnswer: '3/4', confidence: 0.87 },
        ],
      },
      teachingProvider: {
        generateTeachingAdvice: async () => [
          '先复盘选择题排除过程。',
          '再检查填空题计算细节。',
        ],
      },
    });

    const res = await app.request('http://local/grade', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
        origin: 'https://demo.example.com',
      },
      body: JSON.stringify({
        answerKey: '1.A 2.C 3.B 9.12 10.3/4',
        objectKey: 'uploads/demo/scheme-b-clean.jpg',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: number; teachingAdvice: string[] };

    expect(body.score).toBeTypeOf('number');
    expect(body.teachingAdvice).toEqual([
      '先复盘选择题排除过程。',
      '再检查填空题计算细节。',
    ]);
  });

  it('passes fc runtime credentials into object retrieval for grading', async () => {
    const getObjectAiInput = vi.fn(async () => 'https://example.com/sheet.jpg');
    const app = createApp({
      objectStore: {
        createUploadPolicy: async () => ({
          objectKey: 'uploads/demo/scheme-b-clean.jpg',
          uploadUrl: 'https://demo.example.com/uploads/demo/scheme-b-clean.jpg',
          method: 'PUT',
          expiresInSeconds: 300,
          headers: {},
        }),
        getObjectAiInput,
      },
      visionProvider: {
        recognize: async () => [
          { questionNo: 1, recognizedAnswer: 'A', confidence: 0.99 },
        ],
      },
      teachingProvider: {
        generateTeachingAdvice: async () => ['check'],
      },
    });
    const request = attachObjectStoreRuntimeContext(
      new Request('http://local/grade', {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          answerKey: '1.A',
          objectKey: 'uploads/demo/scheme-b-clean.jpg',
        }),
      }),
      {
        region: 'cn-hangzhou',
        credentials: {
          accessKeyId: 'STS.RUNTIME',
          accessKeySecret: 'runtime-secret',
          securityToken: 'runtime-token',
        },
      }
    );

    const response = await app.fetch(request);

    expect(response.status).toBe(200);
    expect(getObjectAiInput).toHaveBeenCalledWith(
      'uploads/demo/scheme-b-clean.jpg',
      {
        region: 'cn-hangzhou',
        credentials: {
          accessKeyId: 'STS.RUNTIME',
          accessKeySecret: 'runtime-secret',
          securityToken: 'runtime-token',
        },
      }
    );
  });
});
