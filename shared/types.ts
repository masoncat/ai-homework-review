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
