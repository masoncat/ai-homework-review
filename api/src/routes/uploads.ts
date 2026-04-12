import { Hono } from 'hono';
import { z } from 'zod';
import { verifyToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const uploadsRoute = new Hono<AppBindings>();

uploadsRoute.post('/policy', async (c) => {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return c.json({ message: '未登录或会话已失效' }, 401);
  }

  await verifyToken(token, c.get('config'));

  const body = z
    .object({
      fileName: z.string().trim().default('sheet.jpg'),
    })
    .parse(await c.req.json());

  return c.json(
    await c
      .get('objectStore')
      .createUploadPolicy(
        body.fileName,
        c.get('objectStoreRuntimeContext') ?? undefined
      )
  );
});

uploadsRoute.put('/mock/*', async (c) => {
  const objectKey = decodeURIComponent(
    c.req.path.replace(/^\/uploads\/mock\//, '')
  );
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const contentType = c.req.header('content-type') ?? 'application/octet-stream';
  const saveObject = c.get('objectStore').saveObject;

  if (!saveObject) {
    return c.json({ message: '当前存储模式不支持本地代理上传' }, 404);
  }

  await saveObject(objectKey, bytes, contentType);
  return c.body(null, 204);
});

uploadsRoute.put('/direct/*', async (c) => {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return c.json({ message: '未登录或会话已失效' }, 401);
  }

  await verifyToken(token, c.get('config'));

  const objectKey = decodeURIComponent(
    c.req.path.replace(/^\/uploads\/direct\//, '')
  );
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const contentType = c.req.header('content-type') ?? 'application/octet-stream';
  const saveObject = c.get('objectStore').saveObject;

  if (!saveObject) {
    return c.json({ message: '当前存储模式不支持服务端代理上传' }, 404);
  }

  await saveObject(
    objectKey,
    bytes,
    contentType,
    c.get('objectStoreRuntimeContext') ?? undefined
  );
  return c.body(null, 204);
});

export default uploadsRoute;
