import { describe, expect, it, vi } from 'vitest';
import { createVisionProvider } from './visionProvider.js';

describe('createVisionProvider', () => {
  it('calls a real multimodal chat completion api and parses recognized answers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { questionNo: 1, recognizedAnswer: 'A', confidence: 0.98 },
                  { questionNo: 9, recognizedAnswer: '12', confidence: 0.91 },
                ],
              }),
            },
          },
        ],
      }),
    });

    const provider = createVisionProvider(
      {
        ocrAiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        ocrAiApiKey: 'test-key',
        ocrAiModel: 'qwen-vl-ocr-latest',
      },
      fetchImpl
    );

    const result = await provider.recognize('data:image/jpeg;base64,ZmFrZQ==', [
      { questionNo: 1, kind: 'choice', answer: 'A' },
      { questionNo: 9, kind: 'fill', answer: '12' },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    );
    expect(result).toEqual([
      { questionNo: 1, recognizedAnswer: 'A', confidence: 0.98 },
      { questionNo: 9, recognizedAnswer: '12', confidence: 0.91 },
    ]);
  });

  it('accepts numeric question numbers returned as strings by the OCR model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { questionNo: '1', recognizedAnswer: 'A', confidence: 0.98 },
                  { questionNo: '9', recognizedAnswer: '12', confidence: 0.91 },
                ],
              }),
            },
          },
        ],
      }),
    });

    const provider = createVisionProvider(
      {
        ocrAiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        ocrAiApiKey: 'test-key',
        ocrAiModel: 'qwen-vl-ocr-latest',
      },
      fetchImpl
    );

    const result = await provider.recognize('data:image/jpeg;base64,ZmFrZQ==', [
      { questionNo: 1, kind: 'choice', answer: 'A' },
      { questionNo: 9, kind: 'fill', answer: '12' },
    ]);

    expect(result).toEqual([
      { questionNo: 1, recognizedAnswer: 'A', confidence: 0.98 },
      { questionNo: 9, recognizedAnswer: '12', confidence: 0.91 },
    ]);
  });
});
