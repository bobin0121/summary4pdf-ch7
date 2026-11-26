// 2026-11-26 10:33 KST
// 설계 5장의 오류 코드, HTTP 상태, 한국어 문구.

export const ERROR_CODES = [
  "FILE_TOO_LARGE",
  "NOT_PDF",
  "PDF_UNREADABLE",
  "NO_TEXT",
  "RATE_LIMITED",
  "TIMEOUT",
  "AI_FAILED",
  "BAD_REQUEST",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// retry: "reupload"는 다른 파일을 올리라는 뜻, "retry"는 같은 파일로 다시 시도하라는 뜻.
export type ErrorInfo = {
  status: number;
  title: string;
  message: string;
  retry: "reupload" | "retry";
};

export const ERRORS: Record<ErrorCode, ErrorInfo> = {
  NOT_PDF: {
    status: 415,
    title: "올릴 수 없는 파일입니다",
    message:
      "PDF 파일만 올릴 수 있습니다. 파일 형식을 확인한 뒤 다시 올려 주세요.",
    retry: "reupload",
  },
  FILE_TOO_LARGE: {
    status: 413,
    title: "파일이 너무 큽니다",
    message: "4MB 이하의 PDF만 올릴 수 있습니다. 필요한 쪽만 나눠서 올려 주세요.",
    retry: "reupload",
  },
  PDF_UNREADABLE: {
    status: 422,
    title: "PDF를 열 수 없습니다",
    message:
      "파일이 손상되었거나 암호가 걸려 있을 수 있습니다. 다른 파일로 시도해 주세요.",
    retry: "reupload",
  },
  NO_TEXT: {
    status: 422,
    title: "글자를 찾을 수 없습니다",
    message:
      "스캔한 이미지로 된 PDF는 지원하지 않습니다. 글자를 복사할 수 있는 PDF를 올려 주세요.",
    retry: "reupload",
  },
  TIMEOUT: {
    status: 504,
    title: "요약이 너무 오래 걸립니다",
    message: "AI 응답이 제때 오지 않았습니다. 잠시 뒤 다시 시도해 주세요.",
    retry: "retry",
  },
  RATE_LIMITED: {
    status: 429,
    title: "오늘 쓸 수 있는 요약 횟수를 넘었습니다",
    message: "무료 AI 모델의 호출 한도에 도달했습니다. 나중에 다시 시도해 주세요.",
    retry: "retry",
  },
  AI_FAILED: {
    status: 502,
    title: "요약하지 못했습니다",
    message:
      "AI가 올바른 요약을 만들지 못했습니다. 다시 시도하거나 다른 파일로 해 보세요.",
    retry: "retry",
  },
  BAD_REQUEST: {
    status: 400,
    title: "올릴 수 없는 파일입니다",
    message: "파일을 다시 골라 주세요.",
    retry: "reupload",
  },
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

// 브라우저가 요청을 끊었다는 뜻. 응답을 받을 쪽이 없으므로 오류 코드를 만들지 않는다.
export class ClientAbortedError extends Error {
  constructor() {
    super("client aborted");
    this.name = "ClientAbortedError";
  }
}
