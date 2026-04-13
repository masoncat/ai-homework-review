export interface AppConfig {
  jwtSecret: string;
  allowedOrigins: string[];
  inviteCodes: string[];
  humanToken: string;
  publicBaseUrl: string;
  objectStoreDriver: 'memory' | 'oss';
  ossBucket: string;
  ossRegion: string;
  ossEndpoint: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  ossSecurityToken: string;
  ossUploadPrefix: string;
  ossUploadExpiresInSeconds: number;
  ossMaxSizeBytes: number;
  ossStsRoleArn: string;
  ossStsSessionName: string;
  ossStsDurationSeconds: number;
  ossStsEndpoint: string;
  ocrAiBaseUrl: string;
  ocrAiApiKey: string;
  ocrAiModel: string;
  textAiBaseUrl: string;
  textAiApiKey: string;
  textAiModel: string;
  textAiStream: boolean;
  batchVisionAiBaseUrl: string;
  batchVisionAiApiKey: string;
  batchVisionAiModel: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const objectStoreDriver =
    env.OBJECT_STORE_DRIVER === 'oss' ? 'oss' : 'memory';

  return {
    jwtSecret: env.JWT_SECRET ?? 'demo-secret',
    allowedOrigins: (env.ALLOWED_ORIGINS ??
      'https://demo.example.com,http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    inviteCodes: (env.INVITE_CODES ?? 'demo-code')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    humanToken: env.HUMAN_CHECK_TOKEN ?? 'pass-human-check',
    publicBaseUrl: env.PUBLIC_BASE_URL ?? 'https://demo.example.com',
    objectStoreDriver,
    ossBucket: env.OSS_BUCKET ?? '',
    ossRegion: env.OSS_REGION ?? '',
    ossEndpoint: env.OSS_ENDPOINT ?? '',
    ossAccessKeyId:
      env.OSS_ACCESS_KEY_ID ?? env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? '',
    ossAccessKeySecret:
      env.OSS_ACCESS_KEY_SECRET ?? env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? '',
    ossSecurityToken:
      env.OSS_SECURITY_TOKEN ?? env.ALIBABA_CLOUD_SECURITY_TOKEN ?? '',
    ossUploadPrefix: env.OSS_UPLOAD_PREFIX ?? 'uploads/demo',
    ossUploadExpiresInSeconds: Number(env.OSS_UPLOAD_EXPIRES_IN_SECONDS ?? 300),
    ossMaxSizeBytes: Number(env.OSS_MAX_SIZE_BYTES ?? 10485760),
    ossStsRoleArn: env.OSS_STS_ROLE_ARN ?? '',
    ossStsSessionName: env.OSS_STS_SESSION_NAME ?? 'ai-homework-review-upload',
    ossStsDurationSeconds: Number(env.OSS_STS_DURATION_SECONDS ?? 900),
    ossStsEndpoint: env.OSS_STS_ENDPOINT ?? 'sts.cn-hangzhou.aliyuncs.com',
    ocrAiBaseUrl:
      env.OCR_AI_BASE_URL ??
      env.AI_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ocrAiApiKey: env.OCR_AI_API_KEY ?? env.AI_API_KEY ?? '',
    ocrAiModel: env.OCR_AI_MODEL ?? env.AI_MODEL ?? 'qwen-vl-ocr-latest',
    textAiBaseUrl: env.TEXT_AI_BASE_URL ?? 'https://api.openai.com/v1',
    textAiApiKey: env.TEXT_AI_API_KEY ?? '',
    textAiModel: env.TEXT_AI_MODEL ?? 'gpt-5.4',
    textAiStream: env.TEXT_AI_STREAM === 'true',
    batchVisionAiBaseUrl:
      env.BATCH_VISION_AI_BASE_URL ??
      env.OCR_AI_BASE_URL ??
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    batchVisionAiApiKey:
      env.BATCH_VISION_AI_API_KEY ?? env.OCR_AI_API_KEY ?? env.AI_API_KEY ?? '',
    batchVisionAiModel:
      env.BATCH_VISION_AI_MODEL ??
      env.OCR_AI_MODEL ??
      env.AI_MODEL ??
      'qwen-vl-max-latest',
  };
}
