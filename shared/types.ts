export type AnswerKind = 'choice' | 'fill';

export interface AnswerKeyItem {
  questionNo: number;
  kind: AnswerKind;
  answer: string;
}

export interface RecognizedAnswer {
  questionNo: number;
  recognizedAnswer: string;
  confidence: number;
}

export interface GradedItem {
  questionNo: number;
  kind: AnswerKind;
  expectedAnswer: string;
  recognizedAnswer: string;
  confidence: number;
  isCorrect: boolean;
  feedback: string;
}

export interface GradeResult {
  score: number;
  correctCount: number;
  totalCount: number;
  focusQuestionNos: number[];
  summary: string;
  teachingAdvice: string[];
  items: GradedItem[];
}

export interface GradeResponse extends GradeResult {
  taskId: string;
}

export interface SessionResponse {
  accessToken: string;
  expiresInSeconds: number;
}

export interface OssStsCredentials {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
}

export interface UploadPolicyResponse {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT' | 'POST';
  expiresInSeconds: number;
  headers: Record<string, string>;
  fields?: Record<string, string>;
  ossSts?: OssStsCredentials;
}

export type BatchReviewLevel = '超出预期' | '达到预期' | '基本达到' | '待提升';

export interface BatchReviewPageResult {
  pageNo: number;
  displayName: string;
  score: number;
  level: BatchReviewLevel;
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
}

export interface BatchReviewSummaryRow {
  pageNo: number;
  displayName: string;
  score: number;
  level: BatchReviewLevel;
  summary: string;
}

export interface BatchReviewSummary {
  totalPages: number;
  averageScore: number;
  rows: BatchReviewSummaryRow[];
  levelCounts: Record<BatchReviewLevel, number>;
}

export interface BatchReviewResult {
  taskId: string;
  rubricObjectKey: string;
  answerPdfObjectKey: string;
  totalPages: number;
  pages: BatchReviewPageResult[];
  summary: BatchReviewSummary;
}
