import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileWithPolicy } from './api';

const putMock = vi.fn();
const constructorMock = vi.fn();

vi.mock('ali-oss', () => {
  return {
    default: class MockOssClient {
      constructor(options: unknown) {
        constructorMock(options);
      }

      async put(objectKey: string, file: File) {
        return putMock(objectKey, file);
      }
    },
  };
});

describe('uploadFileWithPolicy', () => {
  beforeEach(() => {
    putMock.mockReset();
    constructorMock.mockReset();
    vi.restoreAllMocks();
  });

  it('uploads through OSS sts credentials when policy contains temporary credentials', async () => {
    putMock.mockResolvedValue({ url: 'https://oss.example.com/demo.png' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await uploadFileWithPolicy(
      new File(['demo'], 'sheet.png', { type: 'image/png' }),
      {
        objectKey: 'uploads/demo/sheet.png',
        uploadUrl: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
        method: 'PUT',
        expiresInSeconds: 300,
        headers: {},
        ossSts: {
          bucket: 'demo-bucket',
          region: 'cn-shanghai',
          endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
          accessKeyId: 'STS.TEST',
          accessKeySecret: 'secret',
          securityToken: 'token',
        },
      }
    );

    expect(putMock).toHaveBeenCalledWith(
      'uploads/demo/sheet.png',
      expect.any(File)
    );
    expect(constructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'demo-bucket',
        endpoint: 'oss-cn-shanghai.aliyuncs.com',
        region: 'oss-cn-shanghai',
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to backend proxy upload when browser OSS upload fails', async () => {
    putMock.mockRejectedValue(new Error('XHR error'));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);

    await uploadFileWithPolicy(
      new File(['demo'], 'sheet.png', { type: 'image/png' }),
      {
        objectKey: 'uploads/demo/sheet with blank.png',
        uploadUrl: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
        method: 'PUT',
        expiresInSeconds: 300,
        headers: {},
        ossSts: {
          bucket: 'demo-bucket',
          region: 'cn-shanghai',
          endpoint: 'https://demo-bucket.oss-cn-shanghai.aliyuncs.com',
          accessKeyId: 'STS.TEST',
          accessKeySecret: 'secret',
          securityToken: 'token',
        },
      },
      'demo-token'
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8787/uploads/direct/uploads/demo/sheet%20with%20blank.png',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          authorization: 'Bearer demo-token',
          'content-type': 'image/png',
        }),
      })
    );
  });
});
