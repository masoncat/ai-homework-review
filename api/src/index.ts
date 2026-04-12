import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { app } from './app.js';
import { attachObjectStoreRuntimeContext } from './lib/runtimeContext.js';

function toWebReadable(stream: Readable) {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

function createRequestFromNode(
  request: import('node:http').IncomingMessage,
  origin: string
) {
  const url = new URL(request.url ?? '/', origin);
  const method = request.method ?? 'GET';
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : toWebReadable(request);

  return new Request(url, {
    method,
    headers: new Headers(request.headers as Record<string, string>),
    body,
    duplex: body ? 'half' : undefined,
  });
}

interface FcHttpEvent {
  version?: string;
  rawPath?: string;
  rawQueryString?: string;
  queryParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: {
    domainName?: string;
    http?: {
      method?: string;
      path?: string;
    };
  };
}

interface FcHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

function getEventHeader(
  headers: FcHttpEvent['headers'],
  key: string
) {
  if (!headers) {
    return undefined;
  }

  const matchedKey = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase()
  );

  return matchedKey ? headers[matchedKey] : undefined;
}

function normalizeFcHeaders(headers: FcHttpEvent['headers']) {
  const normalized = new Headers();

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value != null) {
      normalized.set(key, value);
    }
  }

  return normalized;
}

function buildUrlFromFcEvent(event: FcHttpEvent) {
  const host =
    getEventHeader(event.headers, 'host') ??
    event.requestContext?.domainName ??
    '127.0.0.1';
  const url = new URL(
    event.rawPath ?? event.requestContext?.http?.path ?? '/',
    `https://${host}`
  );

  if (event.rawQueryString) {
    url.search = event.rawQueryString;
  }

  for (const [key, value] of Object.entries(event.queryParameters ?? {})) {
    if (value != null) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function buildFcBody(event: FcHttpEvent) {
  const method = event.requestContext?.http?.method ?? 'GET';

  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  if (!event.body) {
    return undefined;
  }

  return event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : event.body;
}

function isTextContentType(contentType: string) {
  return (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('javascript') ||
    contentType.includes('svg')
  );
}

function parseFcEvent(event: Buffer | string | FcHttpEvent): FcHttpEvent {
  if (Buffer.isBuffer(event)) {
    return JSON.parse(event.toString('utf8')) as FcHttpEvent;
  }

  if (typeof event === 'string') {
    return JSON.parse(event) as FcHttpEvent;
  }

  return event;
}

export function createFcEventHandler() {
  return async function handler(
    rawEvent: Buffer | string | FcHttpEvent,
    context?: unknown
  ): Promise<FcHttpResponse> {
    const event = parseFcEvent(rawEvent);
    const body = buildFcBody(event);
    const honoRequest = attachObjectStoreRuntimeContext(
      new Request(buildUrlFromFcEvent(event), {
        method: event.requestContext?.http?.method ?? 'GET',
        headers: normalizeFcHeaders(event.headers),
        body,
        duplex: body ? 'half' : undefined,
      }),
      context
    );
    const honoResponse = await app.fetch(honoRequest);
    const headers = Object.fromEntries(honoResponse.headers.entries());

    if (!honoResponse.body) {
      return {
        statusCode: honoResponse.status,
        headers,
        body: '',
        isBase64Encoded: false,
      };
    }

    const buffer = Buffer.from(await honoResponse.arrayBuffer());
    const contentType = honoResponse.headers.get('content-type') ?? '';

    if (isTextContentType(contentType)) {
      return {
        statusCode: honoResponse.status,
        headers,
        body: buffer.toString('utf8'),
        isBase64Encoded: false,
      };
    }

    return {
      statusCode: honoResponse.status,
      headers,
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  }
}

export async function startServer(port = Number(process.env.PORT ?? 8787)) {
  const server = createNodeServer(port);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('无法确定本地 API 监听地址');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

export function createNodeServer(port = Number(process.env.PORT ?? 8787)) {
  return createServer(async (request, response) => {
    const host = request.headers.host ?? `127.0.0.1:${port}`;
    const honoResponse = await app.fetch(
      createRequestFromNode(request, `http://${host}`)
    );

    response.statusCode = honoResponse.status;
    honoResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });

    if (!honoResponse.body) {
      response.end();
      return;
    }

    const reader = honoResponse.body.getReader();

    async function pump() {
      const chunk = await reader.read();

      if (chunk.done) {
        response.end();
        return;
      }

      response.write(Buffer.from(chunk.value));
      await pump();
    }

    await pump();
  });
}

export default app;
export const handler = createFcEventHandler();
