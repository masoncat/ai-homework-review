import { describe, expect, it } from 'vitest';
import { gradeSubmission } from './grading.js';

describe('gradeSubmission', () => {
  it('scores choice and fill answers and returns feedback', () => {
    const result = gradeSubmission(
      [
        { questionNo: 1, kind: 'choice', answer: 'A' },
        { questionNo: 9, kind: 'fill', answer: '12' },
      ],
      [
        { questionNo: 1, recognizedAnswer: 'B', confidence: 0.93 },
        { questionNo: 9, recognizedAnswer: '12', confidence: 0.88 },
      ]
    );

    expect(result.score).toBe(50);
    expect(result.items[0].isCorrect).toBe(false);
    expect(result.items[1].isCorrect).toBe(true);
  });
});
