import type { AnswerKeyItem } from './types.js';

const CHOICE_RE = /^[A-D]$/i;
const TOKEN_SPLIT_RE = /[\s,，;；、]+/;

function normalizeChoiceAnswer(answer: string) {
  return answer.trim().toUpperCase();
}

export function parseAnswerKey(input: string): AnswerKeyItem[] {
  const cleaned = input.trim();

  if (!cleaned) {
    return [];
  }

  const seen = new Set<number>();

  return cleaned
    .split(TOKEN_SPLIT_RE)
    .filter(Boolean)
    .map((token) => {
      const dotIndex = token.indexOf('.');

      if (dotIndex <= 0 || dotIndex === token.length - 1) {
        throw new Error(`无法解析答案项：${token}`);
      }

      const rawNo = token.slice(0, dotIndex);
      const rawAnswer = token.slice(dotIndex + 1).trim();
      const questionNo = Number(rawNo);

      if (!Number.isInteger(questionNo) || questionNo <= 0 || !rawAnswer) {
        throw new Error(`无法解析答案项：${token}`);
      }

      if (seen.has(questionNo)) {
        throw new Error(`题号 ${questionNo} 重复录入`);
      }
      seen.add(questionNo);

      const kind = CHOICE_RE.test(rawAnswer) ? 'choice' : 'fill';

      return {
        questionNo,
        kind,
        answer: kind === 'choice' ? normalizeChoiceAnswer(rawAnswer) : rawAnswer,
      } satisfies AnswerKeyItem;
    })
    .sort((left, right) => left.questionNo - right.questionNo);
}
