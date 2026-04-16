import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import { verifyToken } from '../lib/token.js';
import type { AppBindings } from '../types.js';

const uploadsRoute = new Hono<AppBindings>();
const DEV_DEFAULT_BATCH_ANSWER_PDF_PATH =
  '/Users/a1234/Downloads/智能停车场+2-9+班.pdf';
const DEV_DEFAULT_BATCH_RUBRIC_FILE_PATH =
  '/Users/a1234/Downloads/default.jpeg';

function isLocalDevRequest(url: string) {
  const { hostname } = new URL(url);

  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function resolveDevDefaultBatchAssetPath(assetId: string) {
  if (assetId === 'answer-pdf') {
    return (
      process.env.DEV_DEFAULT_BATCH_ANSWER_PDF_PATH ??
      DEV_DEFAULT_BATCH_ANSWER_PDF_PATH
    );
  }

  if (assetId === 'rubric-file') {
    return (
      process.env.DEV_DEFAULT_BATCH_RUBRIC_FILE_PATH ??
      DEV_DEFAULT_BATCH_RUBRIC_FILE_PATH
    );
  }

  return null;
}

function detectContentType(filePath: string) {
  const extension = extname(filePath).toLowerCase();

  if (extension === '.pdf') {
    return 'application/pdf';
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  return 'application/octet-stream';
}

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

uploadsRoute.get('/dev-default-batch-assets', async (c) => {
  if (!isLocalDevRequest(c.req.url)) {
    return c.json({ message: '当前环境不支持默认测试文件' }, 404);
  }

  const answerPdfPath = resolveDevDefaultBatchAssetPath('answer-pdf');
  const rubricFilePath = resolveDevDefaultBatchAssetPath('rubric-file');

  if (!answerPdfPath || !rubricFilePath) {
    return c.json({ message: '未配置默认测试文件路径' }, 404);
  }

  return c.json({
    inviteCode: process.env.DEV_DEFAULT_BATCH_INVITE_CODE ?? 'demo-code',
    answerPdf: {
      fileName: basename(answerPdfPath),
      url: new URL('/uploads/dev-default-batch-assets/answer-pdf', c.req.url)
        .toString(),
    },
    rubricFile: {
      fileName: basename(rubricFilePath),
      url: new URL('/uploads/dev-default-batch-assets/rubric-file', c.req.url)
        .toString(),
    },
  });
});

uploadsRoute.get('/dev-default-batch-assets/:assetId', async (c) => {
  if (!isLocalDevRequest(c.req.url)) {
    return c.json({ message: '当前环境不支持默认测试文件' }, 404);
  }

  const filePath = resolveDevDefaultBatchAssetPath(c.req.param('assetId'));

  if (!filePath) {
    return c.json({ message: '未找到默认测试文件' }, 404);
  }

  const bytes = await readFile(filePath);

  c.header('content-type', detectContentType(filePath));
  c.header('content-disposition', `inline; filename="${basename(filePath)}"`);

  return c.body(bytes);
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
