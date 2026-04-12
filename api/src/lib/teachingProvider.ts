import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { GradeResult } from '../../../shared/types.js';

export interface TeachingProvider {
  generateTeachingAdvice: (result: GradeResult) => Promise<string[]>;
}

const responseSchema = z.object({
  teachingAdvice: z.array(z.string().trim().min(1)).min(1),
});

function buildUserPrompt(result: GradeResult) {
  const wrongItems = result.items
    .filter((item) => !item.isCorrect)
    .map(
      (item) =>
        `${item.questionNo}题，题型：${item.kind === 'choice' ? '选择题' : '填空题'}，标准答案：${item.expectedAnswer}，学生答案：${item.recognizedAnswer || '空白'}，置信度：${item.confidence}`
    );

  return [
    '请基于这次数学作业批改结果，生成 2 到 3 条老师可直接口头使用的中文讲评建议。',
    '要求：聚焦错题、语言自然、避免空话、不要编造题目内容。',
    `总分：${result.score}`,
    `正确题数：${result.correctCount}/${result.totalCount}`,
    `重点复看题号：${result.focusQuestionNos.length ? result.focusQuestionNos.join('、') : '无'}`,
    '错题明细：',
    ...(wrongItems.length ? wrongItems : ['本次无错题，请给出表扬与巩固建议。']),
    '请只返回 JSON，格式为 {"teachingAdvice":["建议1","建议2"]}。',
  ].join('\n');
}

function extractJsonPayload(content: string) {
  const trimmed = content.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('讲评模型返回内容不是 JSON');
  }

  return JSON.parse(match[0]);
}

function parseStreamContent(raw: string) {
  const chunks = raw
    .split(/\n\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  let text = '';

  for (const chunk of chunks) {
    if (!chunk.startsWith('data:')) {
      continue;
    }

    const payload = chunk.slice(5).trim();

    if (payload === '[DONE]') {
      break;
    }

    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string | null } }>;
      error?: { message?: string };
    };

    if (parsed.error?.message) {
      throw new Error(parsed.error.message);
    }

    const delta = parsed.choices?.[0]?.delta?.content;

    if (typeof delta === 'string') {
      text += delta;
    }
  }

  if (!text) {
    throw new Error('讲评模型未返回有效内容');
  }

  return text;
}

export function createTeachingProvider(
  config: Pick<
    AppConfig,
    'textAiBaseUrl' | 'textAiApiKey' | 'textAiModel' | 'textAiStream'
  >,
  fetchImpl: typeof fetch = fetch
): TeachingProvider {
  return {
    async generateTeachingAdvice(result) {
      if (!config.textAiApiKey || !config.textAiModel) {
        throw new Error('服务端未配置真实讲评模型参数');
      }

      const res = await fetchImpl(
        `${config.textAiBaseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.textAiApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.textAiModel,
            stream: config.textAiStream,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  '你是小学数学老师的讲评助手。你只能输出 JSON，不要输出 Markdown，不要解释。',
              },
              {
                role: 'user',
                content: buildUserPrompt(result),
              },
            ],
          }),
        }
      );

      if (!res.ok) {
        throw new Error('调用讲评模型失败');
      }

      const rawContent = config.textAiStream
        ? parseStreamContent(await res.text())
        : await (async () => {
            const payload = (await res.json()) as {
              choices?: Array<{ message?: { content?: unknown } }>;
            };
            const content = payload.choices?.[0]?.message?.content;

            if (typeof content !== 'string') {
              throw new Error('讲评模型未返回文本结果');
            }

            return content;
          })();

      const parsed = responseSchema.parse(extractJsonPayload(rawContent));

      return parsed.teachingAdvice;
    },
  };
}
