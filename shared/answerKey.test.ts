import { describe, expect, it } from 'vitest';
import { parseAnswerKey } from './answerKey.js';

describe('parseAnswerKey', () => {
  it('parses compact choice and fill-in input', () => {
    expect(parseAnswerKey('1.A 2.C 3.B 9.12 10.3/4')).toEqual([
      { questionNo: 1, kind: 'choice', answer: 'A' },
      { questionNo: 2, kind: 'choice', answer: 'C' },
      { questionNo: 3, kind: 'choice', answer: 'B' },
      { questionNo: 9, kind: 'fill', answer: '12' },
      { questionNo: 10, kind: 'fill', answer: '3/4' },
    ]);
  });
});
