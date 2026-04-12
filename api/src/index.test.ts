import { describe, expect, it } from 'vitest';
import { createFcEventHandler, createNodeServer } from './index.js';

describe('createNodeServer', () => {
  it('creates a node http server wrapper for the hono app', () => {
    const server = createNodeServer();

    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
  });
});

describe('createFcEventHandler', () => {
  it('returns an aliyun fc http response for the hono app', async () => {
    const handler = createFcEventHandler();

    const response = await handler(
      {
        version: 'v1',
        rawPath: '/health',
        rawQueryString: '',
        headers: {
          host: 'demo-api.example.com',
        },
        requestContext: {
          http: {
            method: 'GET',
            path: '/health',
          },
        },
        isBase64Encoded: false,
        body: '',
      },
      {
        requestId: 'req-1',
        region: 'cn-shanghai',
        credentials: {
          accessKeyId: 'STS.TEST',
          accessKeySecret: 'top-secret',
          securityToken: 'sts-token',
        },
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok');
    expect(response.isBase64Encoded).toBe(false);
    expect(response.headers['content-type']).toBe('text/plain;charset=UTF-8');
  });
});
