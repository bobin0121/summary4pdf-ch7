// 2026-11-26 10:33 KST
// 설계 5장의 오류 코드, HTTP 상태, 한국어 문구.

export const ERROR_CODES = [
  "FILE_TOO_LARGE",
  "NOT_PDF",
  "PDF_UNREADABLE",
  "NO_TEXT",
  "RATE_LIMITED",
  "AI_FAILED",
  "BAD_REQUEST",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  FILE_TOO_LARGE: {
    status: 413,
    message: "파일이 너무 커요. 4MB 이하의 PDF를 올려 주세요.",
  },
  NOT_PDF: { status: 415, message: "PDF 파일만 요약할 수 있어요." },
  PDF_UNREADABLE: {
    status: 422,
    message: "이 PDF는 열 수 없어요. 암호가 없는 다른 파일로 시도해 주세요.",
  },
  NO_TEXT: {
    status: 422,
    message: "글자를 찾지 못했어요. 스캔한 PDF는 아직 요약할 수 없어요.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "지금은 요약할 수 없어요. 잠시 후 다시 시도해 주세요.",
  },
  AI_FAILED: {
    status: 502,
    message: "AI가 답하지 않았어요. 잠시 후 다시 시도해 주세요.",
  },
  BAD_REQUEST: { status: 400, message: "파일을 다시 골라 주세요." },
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode) {
    super(ERRORS[code].message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERRORS[code].status;
  }
}
