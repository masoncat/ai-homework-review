import type {
  AnswerKeyItem,
  GradeResult,
  GradedItem,
  RecognizedAnswer,
} from './types.js';

function normalizeValue(answer: string) {
  return answer.trim().replace(/\s+/g, '').toUpperCase();
}

function buildAdvice(items: GradedItem[]) {
  const wrongItems = items.filter((item) => !item.isCorrect);

  if (wrongItems.length === 0) {
    return [
      '本次作答整体稳定，可继续保持固定版式拍摄与一题一格的答题习惯。',
      '讲评时可先表扬审题与书写规范，再抽查一两题巩固思路。',
    ];
  }

  const fillWrong = wrongItems.filter((item) => item.kind === 'fill');
  const choiceWrong = wrongItems.filter((item) => item.kind === 'choice');

  return [
    choiceWrong.length
      ? '选择题建议先复盘题干关键词，再核对选项排除过程。'
      : '选择题整体较稳，可保留当前答题节奏。',
    fillWrong.length
      ? '填空题建议重点核查计算步骤、分数约分和单位换算。'
      : '填空题结果准确，可继续维持当前规范。',
  ];
}

export function gradeSubmission(
  answerKey: AnswerKeyItem[],
  recognized: RecognizedAnswer[]
): GradeResult {
  const items = answerKey.map<GradedItem>((key) => {
    const hit = recognized.find((item) => item.questionNo === key.questionNo);
    const recognizedAnswer = hit?.recognizedAnswer?.trim() ?? '';
    const isCorrect =
      normalizeValue(recognizedAnswer) === normalizeValue(key.answer);

    return {
      questionNo: key.questionNo,
      kind: key.kind,
      expectedAnswer: key.answer,
      recognizedAnswer,
      confidence: hit?.confidence ?? 0,
      isCorrect,
      feedback: isCorrect
        ? '答案正确'
        : `正确答案为 ${key.answer}，识别结果为 ${recognizedAnswer || '空白'}`,
    };
  });

  const correctCount = items.filter((item) => item.isCorrect).length;
  const totalCount = items.length;
  const score = Math.round((correctCount / Math.max(totalCount, 1)) * 100);
  const focusQuestionNos = items
    .filter((item) => !item.isCorrect)
    .map((item) => item.questionNo);

  return {
    score,
    correctCount,
    totalCount,
    focusQuestionNos,
    summary:
      focusQuestionNos.length > 0
        ? `共批改 ${totalCount} 题，建议重点复看 ${focusQuestionNos.join('、')} 题。`
        : `共批改 ${totalCount} 题，本次作答全部正确。`,
    teachingAdvice: buildAdvice(items),
    items,
  };
}
