import { createHash, createHmac } from 'node:crypto';
import OSS from 'ali-oss';
import StsSdk, { AssumeRoleRequest } from '@alicloud/sts20150401';
import type { UploadPolicyResponse } from '../../../shared/types.js';
import type { AppConfig } from '../config.js';

export interface ObjectStoreRuntimeContext {
  credentials?: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken?: string;
  };
  region?: string;
}

export interface ObjectStore {
  createUploadPolicy: (
    fileName: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<UploadPolicyResponse>;
  getObjectBytes?: (
    objectKey: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<Uint8Array>;
  saveObject?: (
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<void>;
  getObjectAiInput: (
    objectKey: string,
    runtime?: ObjectStoreRuntimeContext
  ) => Promise<string>;
}

interface StsCredentialPayload {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
}

type StsFetcher = (input: {
  bucket: string;
  objectKey: string;
  roleArn: string;
  sessionName: string;
  durationSeconds: number;
  credentials?: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken?: string;
  };
}) => Promise<StsCredentialPayload>;

interface OssObjectStoreOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  securityToken?: string;
  uploadPrefix?: string;
  expiresInSeconds?: number;
  maxSizeBytes?: number;
  stsRoleArn?: string;
  stsSessionName?: string;
  stsDurationSeconds?: number;
  stsEndpoint?: string;
  stsFetcher?: StsFetcher;
  uploader?: OssUploader;
  downloader?: OssDownloader;
}

type OssUploader = (input: {
  bucket: string;
  endpoint: string;
  region: string;
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
  credentials: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken?: string;
  };
}) => Promise<void>;

type OssDownloader = (input: {
  bucket: string;
  endpoint: string;
  region: string;
  objectKey: string;
  credentials: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken?: string;
  };
}) => Promise<Uint8Array>;

const DEFAULT_UPLOAD_PREFIX = 'uploads/demo';
const DEFAULT_EXPIRES_IN_SECONDS = 300;
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const StsClient = (StsSdk as { default?: new (...args: never[]) => unknown })
  .default as new (config: unknown) => {
    assumeRole: (request: AssumeRoleRequest) => Promise<{
      body?: {
        credentials?: {
          accessKeyId?: string;
          accessKeySecret?: string;
          securityToken?: string;
          expiration?: string;
        };
      };
    }>;
  };

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64');
}

function toUint8Array(value: unknown) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }

  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  throw new Error('OSS 返回了无法识别的对象内容');
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

function buildObjectKey(fileName: string, prefix = DEFAULT_UPLOAD_PREFIX) {
  const safeFileName = sanitizeFileName(fileName || 'sheet.jpg');
  return `${prefix.replace(/\/$/, '')}/${Date.now()}-${safeFileName}`;
}

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacSha256Hex(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function getSigningKey(secret: string, dateStamp: string, region: string) {
  const dateKey = hmacSha256(`aliyun_v4${secret}`, dateStamp);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, 'oss');

  return hmacSha256(serviceKey, 'aliyun_v4_request');
}

function formatOssDate(now: Date) {
  const iso = now.toISOString().replace(/[-:]/g, '');

  return {
    dateStamp: iso.slice(0, 8),
    dateTime: `${iso.slice(0, 8)}T${iso.slice(9, 15)}Z`,
  };
}

function resolveEndpoint(
  bucket: string,
  region: string,
  endpoint?: string
) {
  const resolved =
    endpoint && endpoint.trim().length > 0
      ? endpoint.trim()
      : `https://${bucket}.oss-${region}.aliyuncs.com`;

  return /^https?:\/\//i.test(resolved)
    ? resolved.replace(/\/$/, '')
    : `https://${resolved.replace(/\/$/, '')}`;
}

function resolveOssSdkEndpoint(endpoint: string, bucket: string) {
  const url = new URL(endpoint);
  const bucketPrefix = `${bucket}.`;

  return url.host.startsWith(bucketPrefix)
    ? url.host.slice(bucketPrefix.length)
    : url.host;
}

function resolveObjectReadTarget(
  bucket: string,
  endpoint: string,
  objectKey: string
) {
  const url = new URL(endpoint);
  const encodedObjectKey = encodeObjectKey(objectKey);
  const bucketPrefix = `${bucket}.`;
  const host = url.host.startsWith(bucketPrefix)
    ? url.host
    : `${bucket}.${url.host}`;
  const origin = `${url.protocol}//${host}`;

  return {
    host,
    canonicalResourcePath: `/${bucket}/${encodedObjectKey}`,
    objectUrlBase: `${origin}/${encodedObjectKey}`,
  };
}

function buildCredential(accessKeyId: string, dateStamp: string, region: string) {
  return `${accessKeyId}/${dateStamp}/${region}/oss/aliyun_v4_request`;
}

function resolveCredentials(
  options: OssObjectStoreOptions,
  runtime?: ObjectStoreRuntimeContext
) {
  const accessKeyId =
    runtime?.credentials?.accessKeyId ?? options.accessKeyId ?? '';
  const accessKeySecret =
    runtime?.credentials?.accessKeySecret ?? options.accessKeySecret ?? '';
  const securityToken =
    runtime?.credentials?.securityToken ?? options.securityToken;
  const region = runtime?.region ?? options.region;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('OSS 未配置可用的访问凭证');
  }

  if (!region) {
    throw new Error('OSS 未配置 region');
  }

  return {
    accessKeyId,
    accessKeySecret,
    securityToken,
    region,
  };
}

function resolveCallerCredentialsForSts(
  options: OssObjectStoreOptions,
  runtime?: ObjectStoreRuntimeContext
) {
  const runtimeCredentials = runtime?.credentials;
  const accessKeyId = runtimeCredentials?.accessKeyId ?? options.accessKeyId;
  const accessKeySecret =
    runtimeCredentials?.accessKeySecret ?? options.accessKeySecret;
  const securityToken =
    runtimeCredentials?.securityToken ?? options.securityToken;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      '未获取到可用于申请 OSS 临时上传凭证的访问凭证；本地开发请配置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET，函数计算部署请确认服务角色已生效'
    );
  }

  return {
    accessKeyId,
    accessKeySecret,
    securityToken,
  };
}

function buildCanonicalQuery(query: Record<string, string>) {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeQueryValue(key)}=${encodeQueryValue(String(value))}`
    )
    .join('&');
}

function buildUploadRolePolicy(bucket: string, objectKey: string) {
  return JSON.stringify({
    Version: '1',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['oss:PutObject'],
        Resource: [`acs:oss:*:*:${bucket}/${objectKey}`],
      },
    ],
  });
}

function createStsFetcher(options: OssObjectStoreOptions): StsFetcher | undefined {
  if (options.stsFetcher) {
    return options.stsFetcher;
  }

  if (!options.stsRoleArn) {
    return undefined;
  }

  return async ({
    bucket,
    objectKey,
    roleArn,
    sessionName,
    durationSeconds,
    credentials: callerCredentials,
  }) => {
    if (!callerCredentials?.accessKeyId || !callerCredentials.accessKeySecret) {
      throw new Error('STS 请求缺少有效的调用凭证');
    }

    const client = new StsClient({
      accessKeyId: callerCredentials.accessKeyId,
      accessKeySecret: callerCredentials.accessKeySecret,
      securityToken: callerCredentials.securityToken,
      endpoint: options.stsEndpoint ?? 'sts.cn-hangzhou.aliyuncs.com',
    } as never);
    const response = await client.assumeRole(
      new AssumeRoleRequest({
        roleArn,
        roleSessionName: sessionName,
        durationSeconds,
        policy: buildUploadRolePolicy(bucket, objectKey),
      })
    );
    const assumedCredentials = response.body?.credentials;

    if (
      !assumedCredentials?.accessKeyId ||
      !assumedCredentials.accessKeySecret ||
      !assumedCredentials.securityToken ||
      !assumedCredentials.expiration
    ) {
      throw new Error('STS 未返回有效的临时上传凭证');
    }

    return {
      accessKeyId: assumedCredentials.accessKeyId,
      accessKeySecret: assumedCredentials.accessKeySecret,
      securityToken: assumedCredentials.securityToken,
      expiration: assumedCredentials.expiration,
    };
  };
}

const defaultOssUploader: OssUploader = async ({
  bucket,
  endpoint,
  region,
  objectKey,
  bytes,
  contentType,
  credentials,
}) => {
  const client = new OSS({
    bucket,
    endpoint: resolveOssSdkEndpoint(endpoint, bucket),
    region: region.startsWith('oss-') ? region : `oss-${region}`,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken,
    secure: endpoint.startsWith('https://'),
    authorizationV4: true,
  });

  await client.put(objectKey, Buffer.from(bytes), {
    headers: {
      'Content-Type': contentType,
    },
  });
};

const defaultOssDownloader: OssDownloader = async ({
  bucket,
  endpoint,
  region,
  objectKey,
  credentials,
}) => {
  const client = new OSS({
    bucket,
    endpoint: resolveOssSdkEndpoint(endpoint, bucket),
    region: region.startsWith('oss-') ? region : `oss-${region}`,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken,
    secure: endpoint.startsWith('https://'),
    authorizationV4: true,
  });
  const result = await client.get(objectKey);

  return toUint8Array(result.content);
};

export function createMemoryObjectStore(
  publicBaseUrl = 'https://demo.example.com'
): ObjectStore {
  const store = new Map<string, { bytes: Uint8Array; contentType: string }>();

  return {
    async createUploadPolicy(fileName) {
      const objectKey = buildObjectKey(fileName);
      const encodedObjectKey = encodeObjectKey(objectKey);

      return {
        objectKey,
        uploadUrl: `${publicBaseUrl.replace(
          /\/$/,
          ''
        )}/uploads/mock/${encodedObjectKey}`,
        method: 'PUT',
        expiresInSeconds: DEFAULT_EXPIRES_IN_SECONDS,
        headers: {
          'content-type': 'image/jpeg',
        },
      };
    },
    async saveObject(objectKey, bytes, contentType) {
      store.set(objectKey, { bytes, contentType });
    },
    async getObjectBytes(objectKey) {
      const found = store.get(objectKey);

      if (!found) {
        throw new Error('未找到已上传的答题卡图片');
      }

      return new Uint8Array(found.bytes);
    },
    async getObjectAiInput(objectKey) {
      const found = store.get(objectKey);

      if (!found) {
        throw new Error('未找到已上传的答题卡图片');
      }

      return `data:${found.contentType};base64,${bytesToBase64(found.bytes)}`;
    },
  };
}

export function createOssObjectStore(
  options: OssObjectStoreOptions,
  now: () => Date = () => new Date()
): ObjectStore {
  const stsFetcher = createStsFetcher(options);
  const uploader = options.uploader ?? defaultOssUploader;
  const downloader = options.downloader ?? defaultOssDownloader;

  return {
    async createUploadPolicy(fileName, runtime) {
      const objectKey = buildObjectKey(fileName, options.uploadPrefix);
      const expiresInSeconds =
        options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
      const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
      const endpoint = resolveEndpoint(
        options.bucket,
        options.region,
        options.endpoint
      );

      if (stsFetcher && options.stsRoleArn) {
        const {
          accessKeyId,
          accessKeySecret,
          securityToken,
        } = options.stsFetcher
          ? {
              accessKeyId: runtime?.credentials?.accessKeyId ?? options.accessKeyId,
              accessKeySecret:
                runtime?.credentials?.accessKeySecret ?? options.accessKeySecret,
              securityToken:
                runtime?.credentials?.securityToken ?? options.securityToken,
            }
          : resolveCallerCredentialsForSts(options, runtime);

        const credentials = await stsFetcher({
          bucket: options.bucket,
          objectKey,
          roleArn: options.stsRoleArn,
          sessionName:
            options.stsSessionName ?? 'ai-homework-review-upload',
          durationSeconds:
            options.stsDurationSeconds ?? expiresInSeconds,
          credentials:
            accessKeyId && accessKeySecret
              ? {
                  accessKeyId,
                  accessKeySecret,
                  ...(securityToken ? { securityToken } : {}),
                }
              : undefined,
        });

        return {
          objectKey,
          uploadUrl: endpoint,
          method: 'PUT',
          expiresInSeconds,
          headers: {},
          ossSts: {
            bucket: options.bucket,
            region: options.region,
            endpoint,
            accessKeyId: credentials.accessKeyId,
            accessKeySecret: credentials.accessKeySecret,
            securityToken: credentials.securityToken,
          },
        };
      }

      const currentTime = now();
      const expiration = new Date(
        currentTime.getTime() + expiresInSeconds * 1000
      ).toISOString();
      const { accessKeyId, accessKeySecret, securityToken, region } =
        resolveCredentials(options, runtime);
      const { dateStamp, dateTime } = formatOssDate(currentTime);
      const credential = buildCredential(accessKeyId, dateStamp, region);
      const policyDocument = {
        expiration,
        conditions: [
          ['eq', '$key', objectKey],
          ['content-length-range', 0, maxSizeBytes],
          { bucket: options.bucket },
          { 'x-oss-signature-version': 'OSS4-HMAC-SHA256' },
          { 'x-oss-credential': credential },
          { 'x-oss-date': dateTime },
          { success_action_status: '204' },
          ...(securityToken
            ? [{ 'x-oss-security-token': securityToken }]
            : []),
        ],
      };
      const policy = Buffer.from(JSON.stringify(policyDocument)).toString(
        'base64'
      );
      const signature = hmacSha256Hex(
        getSigningKey(accessKeySecret, dateStamp, region),
        policy
      );
      const fields: Record<string, string> = {
        key: objectKey,
        policy,
        'x-oss-signature-version': 'OSS4-HMAC-SHA256',
        'x-oss-credential': credential,
        'x-oss-date': dateTime,
        'x-oss-signature': signature,
        success_action_status: '204',
      };

      if (securityToken) {
        fields['x-oss-security-token'] = securityToken;
      }

      return {
        objectKey,
        uploadUrl: endpoint,
        method: 'POST',
        expiresInSeconds,
        headers: {},
        fields,
      };
    },
    async saveObject(objectKey, bytes, contentType, runtime) {
      const endpoint = resolveEndpoint(
        options.bucket,
        options.region,
        options.endpoint
      );

      if (stsFetcher && options.stsRoleArn) {
        const callerCredentials = options.stsFetcher
          ? {
              accessKeyId: runtime?.credentials?.accessKeyId ?? options.accessKeyId,
              accessKeySecret:
                runtime?.credentials?.accessKeySecret ?? options.accessKeySecret,
              securityToken:
                runtime?.credentials?.securityToken ?? options.securityToken,
            }
          : resolveCallerCredentialsForSts(options, runtime);
        const uploadCredentials = await stsFetcher({
          bucket: options.bucket,
          objectKey,
          roleArn: options.stsRoleArn,
          sessionName:
            options.stsSessionName ?? 'ai-homework-review-upload',
          durationSeconds:
            options.stsDurationSeconds ?? DEFAULT_EXPIRES_IN_SECONDS,
          credentials:
            callerCredentials.accessKeyId && callerCredentials.accessKeySecret
              ? {
                  accessKeyId: callerCredentials.accessKeyId,
                  accessKeySecret: callerCredentials.accessKeySecret,
                  ...(callerCredentials.securityToken
                    ? { securityToken: callerCredentials.securityToken }
                    : {}),
                }
              : undefined,
        });

        await uploader({
          bucket: options.bucket,
          endpoint,
          region: options.region,
          objectKey,
          bytes,
          contentType,
          credentials: {
            accessKeyId: uploadCredentials.accessKeyId,
            accessKeySecret: uploadCredentials.accessKeySecret,
            securityToken: uploadCredentials.securityToken,
          },
        });
        return;
      }

      const credentials = resolveCredentials(options, runtime);

      await uploader({
        bucket: options.bucket,
        endpoint,
        region: options.region,
        objectKey,
        bytes,
        contentType,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          accessKeySecret: credentials.accessKeySecret,
          ...(credentials.securityToken
            ? { securityToken: credentials.securityToken }
            : {}),
        },
      });
    },
    async getObjectBytes(objectKey, runtime) {
      const endpoint = resolveEndpoint(
        options.bucket,
        options.region,
        options.endpoint
      );
      const credentials = resolveCredentials(options, runtime);

      return downloader({
        bucket: options.bucket,
        endpoint,
        region: options.region,
        objectKey,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          accessKeySecret: credentials.accessKeySecret,
          ...(credentials.securityToken
            ? { securityToken: credentials.securityToken }
            : {}),
        },
      });
    },
    async getObjectAiInput(objectKey, runtime) {
      const expiresInSeconds =
        options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
      const endpoint = resolveEndpoint(
        options.bucket,
        options.region,
        options.endpoint
      );
      const objectReadTarget = resolveObjectReadTarget(
        options.bucket,
        endpoint,
        objectKey
      );
      const currentTime = now();
      const { accessKeyId, accessKeySecret, securityToken, region } =
        resolveCredentials(options, runtime);
      const { dateStamp, dateTime } = formatOssDate(currentTime);
      const credential = buildCredential(accessKeyId, dateStamp, region);
      const query: Record<string, string> = {
        'x-oss-signature-version': 'OSS4-HMAC-SHA256',
        'x-oss-credential': credential,
        'x-oss-date': dateTime,
        'x-oss-expires': String(expiresInSeconds),
        'x-oss-additional-headers': 'host',
      };

      if (securityToken) {
        query['x-oss-security-token'] = securityToken;
      }

      const canonicalQuery = buildCanonicalQuery(query);
      const canonicalRequest = [
        'GET',
        objectReadTarget.canonicalResourcePath,
        canonicalQuery,
        `host:${objectReadTarget.host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
      ].join('\n');
      const stringToSign = [
        'OSS4-HMAC-SHA256',
        dateTime,
        `${dateStamp}/${region}/oss/aliyun_v4_request`,
        sha256Hex(canonicalRequest),
      ].join('\n');
      const signature = hmacSha256Hex(
        getSigningKey(accessKeySecret, dateStamp, region),
        stringToSign
      );

      return `${objectReadTarget.objectUrlBase}?${canonicalQuery}&x-oss-signature=${signature}`;
    },
  };
}

export function createObjectStoreFromConfig(
  config: Pick<
    AppConfig,
    | 'objectStoreDriver'
    | 'publicBaseUrl'
    | 'ossBucket'
    | 'ossRegion'
    | 'ossEndpoint'
    | 'ossAccessKeyId'
    | 'ossAccessKeySecret'
    | 'ossSecurityToken'
    | 'ossUploadPrefix'
    | 'ossUploadExpiresInSeconds'
    | 'ossMaxSizeBytes'
    | 'ossStsRoleArn'
    | 'ossStsSessionName'
    | 'ossStsDurationSeconds'
    | 'ossStsEndpoint'
  >
): ObjectStore {
  if (config.objectStoreDriver === 'oss') {
    if (!config.ossBucket || !config.ossRegion) {
      throw new Error('启用 OSS 时必须配置 OSS_BUCKET 和 OSS_REGION');
    }

    return createOssObjectStore({
      bucket: config.ossBucket,
      region: config.ossRegion,
      endpoint: config.ossEndpoint,
      accessKeyId: config.ossAccessKeyId,
      accessKeySecret: config.ossAccessKeySecret,
      securityToken: config.ossSecurityToken,
      uploadPrefix: config.ossUploadPrefix,
      expiresInSeconds: config.ossUploadExpiresInSeconds,
      maxSizeBytes: config.ossMaxSizeBytes,
      stsRoleArn: config.ossStsRoleArn,
      stsSessionName: config.ossStsSessionName,
      stsDurationSeconds: config.ossStsDurationSeconds,
      stsEndpoint: config.ossStsEndpoint,
    });
  }

  return createMemoryObjectStore(config.publicBaseUrl);
}
