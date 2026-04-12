import { describe, expect, it, vi } from 'vitest';
import { createTeachingProvider } from './teachingProvider.js';
import type { GradeResult } from '../../../shared/types.js';

const gradeResult: GradeResult = {
  score: 80,
  correctCount: 4,
  totalCount: 5,
  focusQuestionNos: [1],
  summary: '共批改 5 题，建议重点复看 1 题。',
  teachingAdvice: ['placeholder'],
  items: [
    {
      questionNo: 1,
      kind: 'choice',
      expectedAnswer: 'A',
      recognizedAnswer: 'B',
      confidence: 0.91,
      isCorrect: false,
      feedback: '正确答案为 A，识别结果为 B',
    },
  ],
};

describe('createTeachingProvider', () => {
  it('calls a text model and parses teaching advice json', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                teachingAdvice: ['先复盘题干关键词。', '再复查易错选项。'],
              }),
            },
          },
        ],
      }),
    });

    const provider = createTeachingProvider(
      {
        textAiBaseUrl: 'https://api.openai.com/v1',
        textAiApiKey: 'test-key',
        textAiModel: 'gpt-5.4',
        textAiStream: false,
      },
      fetchImpl
    );

    const result = await provider.generateTeachingAdvice(gradeResult);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['先复盘题干关键词。', '再复查易错选项。']);
  });

  it('supports stream=true gateways for gpt-5.4 style responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        [
          'data: {"choices":[{"delta":{"content":"{\\"teachingAdvice\\":[\\"先讲错因\\",\\"再做同类题\\"]}"}}]}',
          'data: [DONE]',
        ].join('\n\n'),
    });

    const provider = createTeachingProvider(
      {
        textAiBaseUrl: 'https://api-vip.codex-for.me/v1',
        textAiApiKey: 'test-key',
        textAiModel: 'gpt-5.4',
        textAiStream: true,
      },
      fetchImpl
    );

    const result = await provider.generateTeachingAdvice(gradeResult);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api-vip.codex-for.me/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(result).toEqual(['先讲错因', '再做同类题']);
  });
});
