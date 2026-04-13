import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryObjectStore,
  createOssObjectStore,
} from './objectStore.js';

describe('createMemoryObjectStore', () => {
  it('creates a local put upload policy and returns a data url for ai input', async () => {
    const store = createMemoryObjectStore('https://demo.example.com');
    const policy = await store.createUploadPolicy('sheet.jpg');

    expect(policy.method).toBe('PUT');
    expect(policy.uploadUrl).toContain('/uploads/mock/');

    await store.saveObject?.(
      policy.objectKey,
      new Uint8Array([1, 2, 3]),
      'image/jpeg'
    );

    expect(await store.getObjectAiInput(policy.objectKey)).toBe(
      'data:image/jpeg;base64,AQID'
    );
    expect(await store.getObjectBytes?.(policy.objectKey)).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });
});

describe('createOssObjectStore', () => {
  it('creates OSS sts upload credentials and signs an object url with fc credentials', async () => {
    const store = createOssObjectStore(
      {
        bucket: 'demo-bucket',
        region: 'cn-shanghai',
        endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
        stsRoleArn: 'acs:ram::1234567890123456:role/ai-homework-review-upload',
        stsFetcher: async () => ({
          accessKeyId: 'STS.UPLOAD',
          accessKeySecret: 'upload-secret',
          securityToken: 'upload-token',
          expiration: '2026-04-06T02:08:04.000Z',
        }),
      },
      () => new Date('2026-04-06T02:03:04.000Z')
    );

    const runtime = {
      credentials: {
        accessKeyId: 'STS.TEST',
        accessKeySecret: 'top-secret',
        securityToken: 'sts-token',
      },
      region: 'cn-shanghai',
    };

    const policy = await store.createUploadPolicy('sheet.jpg', runtime);

    expect(policy.method).toBe('PUT');
    expect(policy.uploadUrl).toBe(
      'https://demo-bucket.oss-cn-shanghai.aliyuncs.com'
    );
    expect(policy.ossSts).toMatchObject({
      bucket: 'demo-bucket',
      region: 'cn-shanghai',
      endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
      accessKeyId: 'STS.UPLOAD',
      accessKeySecret: 'upload-secret',
      securityToken: 'upload-token',
    });
    expect(policy.objectKey).toContain('uploads/demo/');

    const imageUrl = await store.getObjectAiInput(policy.objectKey, runtime);

    expect(imageUrl).toContain(
      'https://demo-bucket.oss-cn-shanghai.aliyuncs.com/'
    );
    expect(imageUrl).toContain('x-oss-signature-version=OSS4-HMAC-SHA256');
    expect(imageUrl).toContain('x-oss-signature=');
    expect(imageUrl).toContain('x-oss-security-token=sts-token');
  });

  it('signs object urls correctly when configured with a regional endpoint host', async () => {
    const store = createOssObjectStore(
      {
        bucket: 'demo-bucket',
        region: 'cn-hangzhou',
        endpoint: 'oss-cn-hangzhou.aliyuncs.com',
        accessKeyId: 'STS.TEST',
        accessKeySecret: 'top-secret',
        securityToken: 'sts-token',
      },
      () => new Date('2026-04-06T02:03:04.000Z')
    );

    const imageUrl = await store.getObjectAiInput('uploads/demo/sheet.jpg');

    expect(imageUrl).toContain(
      'https://demo-bucket.oss-cn-hangzhou.aliyuncs.com/uploads/demo/sheet.jpg'
    );
    expect(imageUrl).toContain('x-oss-signature-version=OSS4-HMAC-SHA256');
  });

  it('supports server-side proxy upload through sts credentials', async () => {
    const uploader = vi.fn(async () => undefined);
    const store = createOssObjectStore(
      {
        bucket: 'demo-bucket',
        region: 'cn-shanghai',
        endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
        stsRoleArn: 'acs:ram::1234567890123456:role/ai-homework-review-upload',
        stsFetcher: async () => ({
          accessKeyId: 'STS.UPLOAD',
          accessKeySecret: 'upload-secret',
          securityToken: 'upload-token',
          expiration: '2026-04-06T02:08:04.000Z',
        }),
        uploader,
      },
      () => new Date('2026-04-06T02:03:04.000Z')
    );

    await store.saveObject?.(
      'uploads/demo/sheet.jpg',
      new Uint8Array([1, 2, 3]),
      'image/jpeg',
      {
        credentials: {
          accessKeyId: 'STS.TEST',
          accessKeySecret: 'top-secret',
          securityToken: 'sts-token',
        },
        region: 'cn-shanghai',
      }
    );

    expect(uploader).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'demo-bucket',
        objectKey: 'uploads/demo/sheet.jpg',
        contentType: 'image/jpeg',
        credentials: {
          accessKeyId: 'STS.UPLOAD',
          accessKeySecret: 'upload-secret',
          securityToken: 'upload-token',
        },
      })
    );
  });

  it('reads raw object bytes through the configured downloader', async () => {
    const downloader = vi.fn(async () => new Uint8Array([7, 8, 9]));
    const store = createOssObjectStore({
      bucket: 'demo-bucket',
      region: 'cn-shanghai',
      endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
      accessKeyId: 'STS.TEST',
      accessKeySecret: 'top-secret',
      securityToken: 'sts-token',
      downloader,
    });

    const bytes = await store.getObjectBytes?.('uploads/demo/answers.pdf');

    expect(bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(downloader).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'demo-bucket',
        objectKey: 'uploads/demo/answers.pdf',
        region: 'cn-shanghai',
        credentials: {
          accessKeyId: 'STS.TEST',
          accessKeySecret: 'top-secret',
          securityToken: 'sts-token',
        },
      })
    );
  });
});
