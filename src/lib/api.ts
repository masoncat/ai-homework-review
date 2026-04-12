import type {
  GradeResponse,
  SessionResponse,
  UploadPolicyResponse,
} from '../../shared/types';
import OSS from 'ali-oss';
import { getApiBaseUrl } from './env';

export interface RequestSessionInput {
  inviteCode: string;
  humanToken: string;
}

export interface GradeInput {
  accessToken: string;
  answerKey: string;
  objectKey: string;
}

function resolveOssClientEndpoint(endpoint: string, bucket: string) {
  const normalized = endpoint.replace(/\/$/, '');

  try {
    const url = new URL(normalized);
    const bucketPrefix = `${bucket}.`;

    return url.host.startsWith(bucketPrefix)
      ? url.host.slice(bucketPrefix.length)
      : url.host;
  } catch {
    return normalized;
  }
}

function resolveUrl(path: string) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw new Error('当前未配置后端 API 地址');
  }

  return `${baseUrl}${path}`;
}

export async function requestSession(
  input: RequestSessionInput
): Promise<SessionResponse> {
  const res = await fetch(resolveUrl('/auth/session'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error('获取体验会话失败');
  }

  return res.json();
}

export async function requestUploadPolicy(
  accessToken: string,
  fileName: string
): Promise<UploadPolicyResponse> {
  const res = await fetch(resolveUrl('/uploads/policy'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ fileName }),
  });

  if (!res.ok) {
    throw new Error('获取上传策略失败');
  }

  return res.json();
}

export async function uploadFileWithPolicy(
  file: File,
  policy: UploadPolicyResponse,
  accessToken?: string
): Promise<void> {
  if (policy.ossSts) {
    try {
      await uploadFileWithOssSts(file, policy);
      return;
    } catch (error) {
      if (!accessToken) {
        throw error;
      }

      await uploadFileViaProxy(accessToken, file, policy.objectKey);
      return;
    }
  }

  const res =
    policy.method === 'POST'
      ? await uploadFileWithPostPolicy(file, policy)
      : await fetch(policy.uploadUrl, {
          method: policy.method,
          headers: policy.headers,
          body: file,
        });

  if (!res.ok) {
    throw new Error('上传答题卡失败');
  }
}

async function uploadFileViaProxy(
  accessToken: string,
  file: File,
  objectKey: string
) {
  const encodedObjectKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const res = await fetch(resolveUrl(`/uploads/direct/${encodedObjectKey}`), {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error('上传答题卡失败');
  }
}

async function uploadFileWithOssSts(
  file: File,
  policy: UploadPolicyResponse
) {
  if (!policy.ossSts) {
    throw new Error('缺少 OSS 临时上传凭证');
  }

  const client = new OSS({
    bucket: policy.ossSts.bucket,
    endpoint: resolveOssClientEndpoint(
      policy.ossSts.endpoint,
      policy.ossSts.bucket
    ),
    region: policy.ossSts.region.startsWith('oss-')
      ? policy.ossSts.region
      : `oss-${policy.ossSts.region}`,
    accessKeyId: policy.ossSts.accessKeyId,
    accessKeySecret: policy.ossSts.accessKeySecret,
    stsToken: policy.ossSts.securityToken,
    secure: policy.ossSts.endpoint.startsWith('https://'),
    authorizationV4: true,
  });

  await client.put(policy.objectKey, file);
}

async function uploadFileWithPostPolicy(
  file: File,
  policy: UploadPolicyResponse
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(policy.fields ?? {})) {
    formData.append(key, value);
  }

  formData.append('file', file);

  return fetch(policy.uploadUrl, {
    method: 'POST',
    body: formData,
  });
}

export async function submitGrade(input: GradeInput): Promise<GradeResponse> {
  const res = await fetch(resolveUrl('/grade'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      answerKey: input.answerKey,
      objectKey: input.objectKey,
    }),
  });

  if (!res.ok) {
    throw new Error('提交批改失败');
  }

  return res.json();
}
