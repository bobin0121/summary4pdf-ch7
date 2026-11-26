// 2026-11-26 10:35 KST
import { describe, expect, it } from "vitest";
import { ERRORS } from "../src/lib/errors";
import {
  BAD_RESPONSE_MESSAGE,
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
    expect(validateFile({ name: "a.png", size: 10, type: "image/png" })).toBe(
      ERRORS.NOT_PDF.message,
    );
    expect(validateFile({ name: "a.pdf", size: 10, type: "image/png" })).toBe(
      ERRORS.NOT_PDF.message,
    );
  });
  it("4MB 초과는 FILE_TOO_LARGE 문구", () => {
    expect(
      validateFile({ name: "a.pdf", size: MAX_BYTES + 1, type: "application/pdf" }),
    ).toBe(ERRORS.FILE_TOO_LARGE.message);
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
  it("서버 오류 문구를 그대로 사용", () => {
    expect(
      parseResponse(false, { error: { code: "NO_TEXT", message: "문구" } }),
    ).toEqual({ ok: false, message: "문구" });
  });
  it("형식이 이상하면 안내", () => {
    expect(parseResponse(false, null)).toEqual({
      ok: false,
      message: BAD_RESPONSE_MESSAGE,
    });
    expect(parseResponse(true, {})).toEqual({
      ok: false,
      message: BAD_RESPONSE_MESSAGE,
    });
  });
});

describe("formatSize", () => {
  it("단위 변환", () => {
    expect(formatSize(2048)).toBe("2KB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5MB");
  });
});
