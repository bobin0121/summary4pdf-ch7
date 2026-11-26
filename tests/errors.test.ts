// 2026-11-26 10:33 KST
import { describe, expect, it } from "vitest";
import { ApiError, ERROR_CODES, ERRORS } from "../src/lib/errors";

describe("오류 상수", () => {
  it("설계 5장의 상태 코드와 맞는다", () => {
    expect(ERRORS.FILE_TOO_LARGE.status).toBe(413);
    expect(ERRORS.NOT_PDF.status).toBe(415);
    expect(ERRORS.PDF_UNREADABLE.status).toBe(422);
    expect(ERRORS.NO_TEXT.status).toBe(422);
    expect(ERRORS.RATE_LIMITED.status).toBe(429);
    expect(ERRORS.AI_FAILED.status).toBe(502);
    expect(ERRORS.BAD_REQUEST.status).toBe(400);
  });

  it("모든 코드에 한국어 문구가 있다", () => {
    for (const code of ERROR_CODES) {
      expect(ERRORS[code].message).toMatch(/[가-힣]/);
    }
  });

  it("ApiError는 코드, 상태, 문구를 담는다", () => {
    const e = new ApiError("NO_TEXT");
    expect(e.code).toBe("NO_TEXT");
    expect(e.status).toBe(422);
    expect(e.message).toBe(ERRORS.NO_TEXT.message);
  });
});
