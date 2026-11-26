// 2026-11-26 10:35 KST
// 브라우저 쪽 빠른 검사와 응답 해석(순수 함수).
import { ERRORS, type ErrorCode, type ErrorInfo } from "../lib/errors";
import type { SummarizeError, SummarizeSuccess } from "../lib/types";

export const MAX_BYTES = 4 * 1024 * 1024;

export type ErrorView = Pick<ErrorInfo, "title" | "message" | "retry">;

// 서버 코드가 아닌 화면 쪽 오류(PRD 5.4 네트워크 끊김).
export const NETWORK_ERROR: ErrorView = {
  title: "연결에 실패했습니다",
  message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  retry: "retry",
};

// 오류 코드로 제목, 문구, 버튼 종류를 찾는다. 모르는 코드는 AI 전체 실패와 같은 안내로 한다.
export function errorView(code: unknown): ErrorView {
  const info =
    typeof code === "string" && Object.hasOwn(ERRORS, code)
      ? ERRORS[code as ErrorCode]
      : ERRORS.AI_FAILED;
  return { title: info.title, message: info.message, retry: info.retry };
}

// 문제가 있으면 오류 안내, 없으면 null.
export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}): ErrorView | null {
  const looksPdf =
    file.name.toLowerCase().endsWith(".pdf") &&
    (file.type === "application/pdf" || file.type === "");
  if (!looksPdf) return errorView("NOT_PDF");
  if (file.size > MAX_BYTES) return errorView("FILE_TOO_LARGE");
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// 응답 본문(이미 JSON 해석한 값)을 성공 또는 오류 안내로 가른다.
export function parseResponse(
  ok: boolean,
  body: unknown,
): { ok: true; data: SummarizeSuccess } | { ok: false; error: ErrorView } {
  const b = body as Partial<SummarizeSuccess & SummarizeError> | null;
  if (ok && b && b.summary && typeof b.summary.oneLine === "string") {
    return { ok: true, data: b as SummarizeSuccess };
  }
  return { ok: false, error: errorView(b?.error?.code) };
}
