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
    expect(ERRORS.TIMEOUT.status).toBe(504);
    expect(ERRORS.AI_FAILED.status).toBe(502);
    expect(ERRORS.BAD_REQUEST.status).toBe(400);
  });

  it("모든 코드에 한국어 문구가 있다", () => {
    for (const code of ERROR_CODES) {
      expect(ERRORS[code].message).toMatch(/[가-힣]/);
    }
  });

  it("PRD 5.4 표의 제목과 문구와 버튼 종류가 글자 그대로 맞는다", () => {
    expect(ERRORS.TIMEOUT).toMatchObject({
      title: "요약이 너무 오래 걸립니다",
      message: "AI 응답이 제때 오지 않았습니다. 잠시 뒤 다시 시도해 주세요.",
      retry: "retry",
    });
    expect(ERRORS.RATE_LIMITED.title).toBe(
      "오늘 쓸 수 있는 요약 횟수를 넘었습니다",
    );
    expect(ERRORS.NOT_PDF.title).toBe("올릴 수 없는 파일입니다");
    expect(ERRORS.FILE_TOO_LARGE.title).toBe("파일이 너무 큽니다");
    expect(ERRORS.PDF_UNREADABLE.title).toBe("PDF를 열 수 없습니다");
    expect(ERRORS.NO_TEXT.title).toBe("글자를 찾을 수 없습니다");
    expect(ERRORS.AI_FAILED.title).toBe("요약하지 못했습니다");
    expect(ERRORS.BAD_REQUEST).toMatchObject({
      title: "올릴 수 없는 파일입니다",
      message: "파일을 다시 골라 주세요.",
      retry: "reupload",
    });
  });

  it("모든 오류에 제목, 마침표로 끝나는 문구, 버튼 종류가 있다", () => {
    for (const code of ERROR_CODES) {
      expect(ERRORS[code].title).toMatch(/[가-힣]/);
      expect(ERRORS[code].title.endsWith(".")).toBe(false);
      expect(ERRORS[code].message.endsWith(".")).toBe(true);
      expect(["reupload", "retry"]).toContain(ERRORS[code].retry);
    }
  });

  it("ApiError는 코드, 상태, 문구를 담는다", () => {
    const e = new ApiError("NO_TEXT");
    expect(e.code).toBe("NO_TEXT");
    expect(e.status).toBe(422);
    expect(e.message).toBe(ERRORS.NO_TEXT.message);
  });
});
