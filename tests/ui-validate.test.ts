// 2026-11-26 10:35 KST
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../src/lib/errors";
import {
  NETWORK_ERROR,
  errorView,
  MAX_BYTES,
  formatSize,
  parseResponse,
  validateFile,
} from "../src/components/validate";

describe("validateFile", () => {
  it("정상 PDF는 통과", () => {
    expect(
      validateFile({ name: "a.PDF", size: 1000, type: "application/pdf" }),
    ).toBeNull();
  });
  it("PDF가 아니면 NOT_PDF 문구", () => {
    expect(validateFile({ name: "a.png", size: 10, type: "image/png" })).toEqual(
      errorView("NOT_PDF"),
    );
    expect(validateFile({ name: "a.pdf", size: 10, type: "image/png" })).toEqual(
      errorView("NOT_PDF"),
    );
  });
  it("4MB 초과는 FILE_TOO_LARGE 문구", () => {
    expect(
      validateFile({ name: "a.pdf", size: MAX_BYTES + 1, type: "application/pdf" }),
    ).toEqual(errorView("FILE_TOO_LARGE"));
    expect(
      validateFile({ name: "a.pdf", size: MAX_BYTES, type: "application/pdf" }),
    ).toBeNull();
  });
});

describe("parseResponse", () => {
  it("성공", () => {
    const body = {
      summary: { oneLine: "x", concepts: [], definitions: [] },
      truncated: false,
      model: "m",
    };
    expect(parseResponse(true, body).ok).toBe(true);
  });
  it("서버 오류 코드로 안내를 찾는다(서버 문구가 달라도 같은 문구)", () => {
    expect(
      parseResponse(false, { error: { code: "NO_TEXT", message: "문구" } }),
    ).toEqual({ ok: false, error: errorView("NO_TEXT") });
  });
  it("형식이 이상하거나 모르는 코드면 AI 전체 실패 안내", () => {
    const fallback = { ok: false, error: errorView("AI_FAILED") };
    expect(parseResponse(false, null)).toEqual(fallback);
    expect(parseResponse(true, {})).toEqual(fallback);
    expect(
      parseResponse(false, { error: { code: "INTERNAL", message: "x" } }),
    ).toEqual(fallback);
  });
});

describe("errorView", () => {
  const expected: Record<string, [string, string]> = {
    NOT_PDF: ["올릴 수 없는 파일입니다", "reupload"],
    FILE_TOO_LARGE: ["파일이 너무 큽니다", "reupload"],
    PDF_UNREADABLE: ["PDF를 열 수 없습니다", "reupload"],
    NO_TEXT: ["글자를 찾을 수 없습니다", "reupload"],
    BAD_REQUEST: ["올릴 수 없는 파일입니다", "reupload"],
    TIMEOUT: ["요약이 너무 오래 걸립니다", "retry"],
    RATE_LIMITED: ["오늘 쓸 수 있는 요약 횟수를 넘었습니다", "retry"],
    AI_FAILED: ["요약하지 못했습니다", "retry"],
  };
  it("오류 코드마다 제목과 버튼 종류가 PRD 표와 같다", () => {
    expect(Object.keys(expected).sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      const v = errorView(code);
      expect([v.title, v.retry]).toEqual(expected[code]);
    }
  });
  it("네트워크 끊김은 다시 시도", () => {
    expect(NETWORK_ERROR).toEqual({
      title: "연결에 실패했습니다",
      message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
      retry: "retry",
    });
  });
});

describe("formatSize", () => {
  it("단위 변환", () => {
    expect(formatSize(2048)).toBe("2KB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5MB");
  });
});
