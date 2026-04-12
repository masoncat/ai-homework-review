import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { AnswerKeyItem, RecognizedAnswer } from '../../../shared/types.js';

export interface VisionProvider {
  recognize: (
    imageInput: string,
    answerKey: AnswerKeyItem[]
  ) => Promise<RecognizedAnswer[]>;
}

const responseSchema = z.object({
  items: z.array(
    z.object({
      questionNo: z.union([z.number().int().positive(), z.string().trim()]),
      recognizedAnswer: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
});

function normalizeQuestionNo(questionNo: number | string) {
  if (typeof questionNo === 'number') {
    return questionNo;
  }

  const parsed = Number(questionNo);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`OCR 返回了无效题号: ${questionNo}`);
  }

  return parsed;
}

function buildUserPrompt(answerKey: AnswerKeyItem[]) {
  const lines = answerKey.map(
    (item) => `${item.questionNo}. ${item.kind === 'choice' ? '选择题' : '填空题'}`
  );

  return [
    '请识别这张固定版式数学答题卡中每道题的作答结果。',
    '只识别这些题号，不要补充额外题目：',
    ...lines,
    '请只返回 JSON，格式为 {"items":[{"questionNo":1,"recognizedAnswer":"A","confidence":0.98}]}。',
    'confidence 使用 0 到 1 的小数。',
  ].join('\n');
}

function extractJsonPayload(content: unknown) {
  if (typeof content !== 'string') {
    throw new Error('多模态模型未返回文本结果');
  }

  const trimmed = content.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('多模态模型返回内容不是 JSON');
  }

  return JSON.parse(match[0]);
}

export function createVisionProvider(
  config: Pick<AppConfig, 'ocrAiApiKey' | 'ocrAiBaseUrl' | 'ocrAiModel'>,
  fetchImpl: typeof fetch = fetch
): VisionProvider {
  return {
    async recognize(imageInput, answerKey) {
      if (!config.ocrAiApiKey || !config.ocrAiModel) {
        throw new Error('服务端未配置真实 OCR 模型参数');
      }

      const res = await fetchImpl(
        `${config.ocrAiBaseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.ocrAiApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.ocrAiModel,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  '你是数学答题卡识别助手。你只能返回 JSON，不要输出 Markdown，不要解释。',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: buildUserPrompt(answerKey) },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageInput,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!res.ok) {
        throw new Error('调用多模态模型失败');
      }

      const payload = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const parsed = responseSchema.parse(extractJsonPayload(content));

      return parsed.items.map((item) => ({
        questionNo: normalizeQuestionNo(item.questionNo),
        recognizedAnswer: item.recognizedAnswer,
        confidence: item.confidence,
      }));
    },
  };
}
