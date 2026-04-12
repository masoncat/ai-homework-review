import type { ObjectStoreRuntimeContext } from './objectStore.js';

const OBJECT_STORE_RUNTIME_CONTEXT_SYMBOL = Symbol.for(
  'ai-homework-review.object-store-runtime-context'
);

interface FunctionComputeContextLike {
  region?: string;
  credentials?: {
    accessKeyId?: string;
    accessKeySecret?: string;
    securityToken?: string;
  };
}

type RequestWithRuntimeContext = Request & {
  [OBJECT_STORE_RUNTIME_CONTEXT_SYMBOL]?: ObjectStoreRuntimeContext;
};

export function extractObjectStoreRuntimeContext(
  context?: unknown
): ObjectStoreRuntimeContext | null {
  const candidate = context as FunctionComputeContextLike | undefined;
  const accessKeyId = candidate?.credentials?.accessKeyId?.trim();
  const accessKeySecret = candidate?.credentials?.accessKeySecret?.trim();
  const securityToken = candidate?.credentials?.securityToken?.trim();
  const region = candidate?.region?.trim();

  if (!accessKeyId && !accessKeySecret && !securityToken && !region) {
    return null;
  }

  return {
    credentials:
      accessKeyId && accessKeySecret
        ? {
            accessKeyId,
            accessKeySecret,
            ...(securityToken ? { securityToken } : {}),
          }
        : undefined,
    region,
  };
}

export function attachObjectStoreRuntimeContext(
  request: Request,
  context?: unknown
) {
  const runtimeContext = extractObjectStoreRuntimeContext(context);

  if (!runtimeContext) {
    return request;
  }

  (request as RequestWithRuntimeContext)[OBJECT_STORE_RUNTIME_CONTEXT_SYMBOL] =
    runtimeContext;

  return request;
}

export function readObjectStoreRuntimeContext(
  request: Request
): ObjectStoreRuntimeContext | null {
  return (
    (request as RequestWithRuntimeContext)[
      OBJECT_STORE_RUNTIME_CONTEXT_SYMBOL
    ] ?? null
  );
}
