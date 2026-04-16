import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createOssObjectStore } from '../lib/objectStore.js';
import { attachObjectStoreRuntimeContext } from '../lib/runtimeContext.js';
import { readConfig } from '../config.js';
import { app } from '../app.js';

describe('POST /uploads/policy', () => {
  it('returns a signed upload target and accepts the upload payload', async () => {
    const policyRes = await app.request('http://local/uploads/policy', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'sheet.jpg' }),
    });

    expect(policyRes.status).toBe(200);

    const policy = (await policyRes.json()) as {
      uploadUrl: string;
      objectKey: string;
      method: 'PUT';
    };

    expect(policy.uploadUrl).toContain('/uploads/mock/');

    const uploadPath = new URL(policy.uploadUrl).pathname;
    const uploadRes = await app.request(`http://local${uploadPath}`, {
      method: 'PUT',
      body: 'mock-image',
    });

    expect(uploadRes.status).toBe(204);
  });

  it('returns an OSS form upload policy when aliyun object storage is enabled', async () => {
    const ossApp = createApp({
      config: readConfig({
        OBJECT_STORE_DRIVER: 'oss',
        OSS_BUCKET: 'demo-bucket',
        OSS_REGION: 'cn-shanghai',
        OSS_ENDPOINT: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
      }),
      objectStore: createOssObjectStore({
        bucket: 'demo-bucket',
        region: 'cn-shanghai',
        endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
        stsRoleArn:
          'acs:ram::1234567890123456:role/ai-homework-review-upload',
        stsFetcher: async () => ({
          accessKeyId: 'STS.UPLOAD',
          accessKeySecret: 'upload-secret',
          securityToken: 'upload-token',
          expiration: '2026-04-07T00:30:00.000Z',
        }),
      }),
    });
    const policyRes = await ossApp.request('http://local/uploads/policy', {
      method: 'POST',
      headers: {
        authorization: 'Bearer demo-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'sheet.jpg' }),
    });

    expect(policyRes.status).toBe(200);

    const policy = (await policyRes.json()) as {
      uploadUrl: string;
      method: 'PUT';
      ossSts: {
        accessKeyId: string;
        accessKeySecret: string;
        securityToken: string;
      };
    };

    expect(policy.method).toBe('PUT');
    expect(policy.uploadUrl).toBe(
      'https://demo-bucket.oss-cn-shanghai.aliyuncs.com'
    );
    expect(policy.ossSts.accessKeyId).toBe('STS.UPLOAD');
  });

  it('passes fc runtime credentials into upload policy creation', async () => {
    const createUploadPolicy = vi.fn(async () => ({
      objectKey: 'uploads/demo/runtime-sheet.jpg',
      uploadUrl: 'https://demo-bucket.oss-cn-hangzhou.aliyuncs.com',
      method: 'PUT' as const,
      expiresInSeconds: 300,
      headers: {},
    }));
    const runtimeApp = createApp({
      objectStore: {
        createUploadPolicy,
        getObjectAiInput: async () => 'https://example.com/runtime-sheet.jpg',
      },
    });
    const request = attachObjectStoreRuntimeContext(
      new Request('http://local/uploads/policy', {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ fileName: 'runtime-sheet.jpg' }),
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

    const response = await runtimeApp.fetch(request);

    expect(response.status).toBe(200);
    expect(createUploadPolicy).toHaveBeenCalledWith('runtime-sheet.jpg', {
      region: 'cn-hangzhou',
      credentials: {
        accessKeyId: 'STS.RUNTIME',
        accessKeySecret: 'runtime-secret',
        securityToken: 'runtime-token',
      },
    });
  });
});

describe('PUT /uploads/direct/*', () => {
  it('proxies browser upload payloads through the api object store', async () => {
    const saveObject = vi.fn(async () => undefined);
    const proxyApp = createApp({
      objectStore: {
        createUploadPolicy: async () => ({
          objectKey: 'uploads/demo/runtime-sheet.jpg',
          uploadUrl: 'https://demo-bucket.oss-cn-hangzhou.aliyuncs.com',
          method: 'PUT',
          expiresInSeconds: 300,
          headers: {},
        }),
        saveObject,
        getObjectAiInput: async () => 'https://example.com/runtime-sheet.jpg',
      },
    });

    const response = await proxyApp.request(
      'http://local/uploads/direct/uploads/demo/runtime-sheet.jpg',
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer demo-token',
          'content-type': 'image/png',
        },
        body: 'mock-image',
      }
    );

    expect(response.status).toBe(204);
    expect(saveObject).toHaveBeenCalledWith(
      'uploads/demo/runtime-sheet.jpg',
      expect.any(Uint8Array),
      'image/png',
      undefined
    );
  });
});

describe('GET /uploads/dev-default-batch-assets*', () => {
  it('returns local-dev default batch asset manifest and file bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'batch-default-assets-'));
    const answerPdfPath = join(dir, 'answers.pdf');
    const rubricFilePath = join(dir, 'default.jpeg');
    await writeFile(answerPdfPath, 'mock-pdf');
    await writeFile(rubricFilePath, 'mock-jpeg');

    const previousAnswerPdfPath = process.env.DEV_DEFAULT_BATCH_ANSWER_PDF_PATH;
    const previousRubricFilePath = process.env.DEV_DEFAULT_BATCH_RUBRIC_FILE_PATH;
    const previousInviteCode = process.env.DEV_DEFAULT_BATCH_INVITE_CODE;

    process.env.DEV_DEFAULT_BATCH_ANSWER_PDF_PATH = answerPdfPath;
    process.env.DEV_DEFAULT_BATCH_RUBRIC_FILE_PATH = rubricFilePath;
    process.env.DEV_DEFAULT_BATCH_INVITE_CODE = 'demo-code';

    try {
      const manifestResponse = await app.request(
        'http://127.0.0.1:8787/uploads/dev-default-batch-assets'
      );

      expect(manifestResponse.status).toBe(200);
      const manifest = (await manifestResponse.json()) as {
        inviteCode: string;
        answerPdf: { fileName: string; url: string };
        rubricFile: { fileName: string; url: string };
      };

      expect(manifest.inviteCode).toBe('demo-code');
      expect(manifest.answerPdf.fileName).toBe('answers.pdf');
      expect(manifest.rubricFile.fileName).toBe('default.jpeg');

      const answerResponse = await app.request(manifest.answerPdf.url);
      const rubricResponse = await app.request(manifest.rubricFile.url);

      expect(answerResponse.status).toBe(200);
      expect(rubricResponse.status).toBe(200);
      expect(await answerResponse.text()).toBe('mock-pdf');
      expect(await rubricResponse.text()).toBe('mock-jpeg');
    } finally {
      process.env.DEV_DEFAULT_BATCH_ANSWER_PDF_PATH = previousAnswerPdfPath;
      process.env.DEV_DEFAULT_BATCH_RUBRIC_FILE_PATH = previousRubricFilePath;
      process.env.DEV_DEFAULT_BATCH_INVITE_CODE = previousInviteCode;
    }
  });
});
