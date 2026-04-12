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
