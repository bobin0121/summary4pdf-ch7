// 2026-11-26 10:35 KST
// 브라우저 쪽 빠른 검사와 응답 해석(순수 함수).
import { ERRORS } from "../lib/errors";
import type { SummarizeError, SummarizeSuccess } from "../lib/types";

export const MAX_BYTES = 4 * 1024 * 1024;

export const NETWORK_MESSAGE = "인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
export const BAD_RESPONSE_MESSAGE =
  "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.";

// 문제가 있으면 안내 문구, 없으면 null.
export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  const looksPdf =
    file.name.toLowerCase().endsWith(".pdf") &&
    (file.type === "application/pdf" || file.type === "");
  if (!looksPdf) return ERRORS.NOT_PDF.message;
  if (file.size > MAX_BYTES) return ERRORS.FILE_TOO_LARGE.message;
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// 응답 본문(이미 JSON 해석한 값)을 성공 또는 오류 문구로 가른다.
export function parseResponse(
  ok: boolean,
  body: unknown,
): { ok: true; data: SummarizeSuccess } | { ok: false; message: string } {
  const b = body as Partial<SummarizeSuccess & SummarizeError> | null;
  if (ok && b && b.summary && typeof b.summary.oneLine === "string") {
    return { ok: true, data: b as SummarizeSuccess };
  }
  if (b && b.error && typeof b.error.message === "string") {
    return { ok: false, message: b.error.message };
  }
  return { ok: false, message: BAD_RESPONSE_MESSAGE };
}
