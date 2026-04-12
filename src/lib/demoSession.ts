import { gradeSubmission } from '../../shared/grading';
import type {
  AnswerKeyItem,
  GradeResponse,
  RecognizedAnswer,
} from '../../shared/types';

const STORAGE_KEY = 'ai-homework-review:last-result';

function rotateChoice(answer: string) {
  const order = ['A', 'B', 'C', 'D'];
  const currentIndex = order.indexOf(answer.toUpperCase());

  if (currentIndex === -1) {
    return 'A';
  }

  return order[(currentIndex + 1) % order.length];
}

function createRecognizedAnswers(answerKey: AnswerKeyItem[]): RecognizedAnswer[] {
  return answerKey.map((item, index) => {
    const shouldFlip = index === 2;
    const recognizedAnswer = shouldFlip
      ? item.kind === 'choice'
        ? rotateChoice(item.answer)
        : `${item.answer}0`
      : item.answer;

    return {
      questionNo: item.questionNo,
      recognizedAnswer,
      confidence: shouldFlip ? 0.79 : 0.95,
    };
  });
}

export function createDemoGradeResponse(answerKey: AnswerKeyItem[]): GradeResponse {
  const taskId = `demo-${Date.now()}`;
  const graded = gradeSubmission(answerKey, createRecognizedAnswers(answerKey));

  return {
    taskId,
    ...graded,
  };
}

export function getFallbackGradeResponse(): GradeResponse {
  const items = Array.from({ length: 12 }, (_, index) => ({
    questionNo: index + 1,
    kind: index < 8 ? ('choice' as const) : ('fill' as const),
    answer:
      index < 8 ? ['A', 'C', 'B', 'D', 'A', 'B', 'C', 'D'][index] : ['12', '3/4', '18', '24'][index - 8],
  }));

  return createDemoGradeResponse(items);
}

export function saveLatestGradeResponse(result: GradeResponse) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
}

export function loadLatestGradeResponse(): GradeResponse | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as GradeResponse;
  } catch {
    return null;
  }
}
