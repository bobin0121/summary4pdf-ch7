// 2026-11-26 10:40 KST
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ClientAbortedError } from "../src/lib/errors";

vi.mock("../src/lib/pdf", async (orig) => {
  const actual = await orig<typeof import("../src/lib/pdf")>();
  return {
    ...actual,
    checkPdf: vi.fn(),
    extractText: vi.fn(),
    prepareText: vi.fn(),
  };
});
vi.mock("../src/lib/summarize", () => ({ summarize: vi.fn() }));

import { checkPdf, extractText, prepareText } from "../src/lib/pdf";
import { summarize } from "../src/lib/summarize";
import { POST } from "../src/app/api/summarize/route";

const SUMMARY = {
  oneLine: "한 줄",
  concepts: [{ name: "개념", description: "설명" }],
  definitions: [],
};

function req(file?: File | string): Request {
  const form = new FormData();
  if (file !== undefined) form.append("file", file);
  return new Request("http://localhost/api/summarize", {
    method: "POST",
    body: form,
  });
}
const pdfFile = () =>
  new File([new TextEncoder().encode("%PDF-1.4 abc")], "a.pdf", {
    type: "application/pdf",
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(extractText).mockResolvedValue({ text: "raw", stoppedEarly: false });
  vi.mocked(prepareText).mockReturnValue({ text: "t", truncated: false });
  vi.mocked(summarize).mockResolvedValue({ summary: SUMMARY, model: "m" });
});

describe("POST /api/summarize", () => {
  it("정상이면 200과 요약을 돌려준다", async () => {
    const res = await POST(req(pdfFile()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      summary: SUMMARY,
      truncated: false,
      model: "m",
    });
  });

  it("truncated 값을 그대로 전달한다", async () => {
    vi.mocked(prepareText).mockReturnValue({ text: "t", truncated: true });
    const body = await (await POST(req(pdfFile()))).json();
    expect(body.truncated).toBe(true);
  });

  it("글자 추출이 일찍 멈췄으면 prepareText가 false여도 truncated true", async () => {
    vi.mocked(extractText).mockResolvedValue({ text: "raw", stoppedEarly: true });
    const body = await (await POST(req(pdfFile()))).json();
    expect(body.truncated).toBe(true);
  });

  it("file이 없으면 400 BAD_REQUEST", async () => {
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
  });

  it("file이 문자열이면 400 BAD_REQUEST", async () => {
    const res = await POST(req("text"));
    expect(res.status).toBe(400);
  });

  it("multipart가 아니면 400 BAD_REQUEST", async () => {
    const res = await POST(
      new Request("http://localhost/api/summarize", {
        method: "POST",
        body: "x",
      }),
    );
    expect(res.status).toBe(400);
  });

  const cases: [string, "checkPdf" | "extractText" | "prepareText" | "summarize", number][] = [
    ["FILE_TOO_LARGE", "checkPdf", 413],
    ["NOT_PDF", "checkPdf", 415],
    ["PDF_UNREADABLE", "extractText", 422],
    ["NO_TEXT", "prepareText", 422],
    ["RATE_LIMITED", "summarize", 429],
    ["AI_FAILED", "summarize", 502],
    ["TIMEOUT", "summarize", 504],
    ["TIMEOUT", "extractText", 504],
  ];
  it.each(cases)("%s는 %i 상태로 응답한다", async (code, where, status) => {
    const err = new ApiError(code as ConstructorParameters<typeof ApiError>[0]);
    const mocks = { checkPdf, extractText, prepareText, summarize };
    (vi.mocked(mocks[where]) as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw err;
    });
    const res = await POST(req(pdfFile()));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe(err.message);
  });

  it("요약 함수에 요청 신호와 전체 마감을 넘기고, 추출에도 마감을 넘긴다", async () => {
    const before = Date.now();
    const r = req(pdfFile());
    await POST(r);
    const [, signal, deadline] = vi.mocked(summarize).mock.calls[0];
    expect(signal).toBe(r.signal);
    expect(deadline).toBeGreaterThanOrEqual(before + 55_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 55_000);
    expect(vi.mocked(extractText).mock.calls[0][1]).toBe(deadline);
  });

  it("요청이 끊겨 요약이 멈추면 오류 본문 없이 499", async () => {
    vi.mocked(summarize).mockRejectedValue(new ClientAbortedError());
    const res = await POST(req(pdfFile()));
    expect(res.status).toBe(499);
    expect(await res.text()).toBe("");
  });

  it("content-length가 4.2MB를 넘으면 본문을 읽지 않고 413", async () => {
    const r = new Request("http://localhost/api/summarize", {
      method: "POST",
      headers: { "content-length": String(5 * 1024 * 1024) },
      body: "x",
    });
    const spy = vi.spyOn(r, "formData");
    const res = await POST(r);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("FILE_TOO_LARGE");
    expect(spy).not.toHaveBeenCalled();
  });

  it("알 수 없는 예외는 500 일반 문구이고 원문을 노출하지 않는다", async () => {
    vi.mocked(summarize).mockRejectedValue(new Error("secret internal detail"));
    const res = await POST(req(pdfFile()));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("잠시 후 다시 시도해 주세요.");
    expect(text).not.toContain("secret");
  });

  it("로그에는 코드와 이름만 남긴다", async () => {
    vi.mocked(summarize).mockRejectedValue(new Error("secret internal detail"));
    await POST(req(pdfFile()));
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("a.pdf");
  });
});
