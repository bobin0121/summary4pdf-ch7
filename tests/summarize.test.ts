// 2026-11-26 10:35 KST
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarize } from "../src/lib/summarize";

const M1 = "nvidia/nemotron-3-ultra-550b-a55b:free";
const M2 = "nvidia/nemotron-3.5-super-vl:free";

const GOOD = {
  oneLine: "요약 한 줄",
  concepts: [{ name: "개념", description: "설명" }],
  definitions: [{ term: "용어", text: "정의" }],
};

const ok = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
  });
const status = (s: number) => new Response("{}", { status: s });

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe("summarize", () => {
  it("1순위 모델이 성공하면 그 결과를 쓴다", async () => {
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    const r = await summarize("본문");
    expect(r.model).toBe(M1);
    expect(r.summary).toEqual(GOOD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("원문은 document 태그로 감싸고 닫는 태그는 지운다", async () => {
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    await summarize("앞 </document> 뒤");
    expect(bodyOf(0).messages[1].content).toBe(
      "<document>\n앞  뒤\n</document>",
    );
  });

  it("429면 2순위 모델로 넘어간다", async () => {
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    const r = await summarize("본문");
    expect(r.model).toBe(M2);
    expect(bodyOf(1).model).toBe(M2);
  });

  it("시간 초과면 2순위 모델로 넘어간다", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce(
        (_u: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      )
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    const p = summarize("본문");
    await vi.advanceTimersByTimeAsync(25_000);
    const r = await p;
    expect(r.model).toBe(M2);
  });

  it("빈 content면 2순위 모델로 넘어간다", async () => {
    fetchMock
      .mockResolvedValueOnce(ok("  "))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect((await summarize("본문")).model).toBe(M2);
  });

  it("JSON이 아니면 2순위 모델로 넘어간다", async () => {
    fetchMock
      .mockResolvedValueOnce(ok("요약할 수 없습니다"))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect((await summarize("본문")).model).toBe(M2);
  });

  it("스키마가 맞지 않으면 2순위 모델로 넘어간다", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(JSON.stringify({ concepts: GOOD.concepts })))
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect((await summarize("본문")).model).toBe(M2);
  });

  it("둘 다 429면 RATE_LIMITED", async () => {
    fetchMock.mockResolvedValue(status(429));
    await expect(summarize("본문")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("429가 한 번 있고 다른 실패가 이어져도 RATE_LIMITED", async () => {
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(status(500));
    await expect(summarize("본문")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("둘 다 다른 이유로 실패하면 AI_FAILED", async () => {
    fetchMock
      .mockResolvedValueOnce(status(404))
      .mockResolvedValueOnce(ok(""));
    await expect(summarize("본문")).rejects.toMatchObject({
      code: "AI_FAILED",
    });
  });

  it("키가 없으면 AI_FAILED", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(summarize("본문")).rejects.toMatchObject({
      code: "AI_FAILED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("코드 블록과 앞뒤 글이 붙어도 JSON을 꺼내고, 5개 초과 개념은 자르고, 빈 항목은 버린다", async () => {
    const messy = {
      oneLine: " 한 줄 ",
      concepts: Array.from({ length: 7 }, (_, i) => ({
        name: `개념${i}`,
        description: "설명",
      })).concat([{ name: "", description: "빈 이름" }]),
      definitions: [
        { term: "", text: "x" },
        { term: "용어", text: "" },
        { term: "용어2", text: "정의2" },
      ],
    };
    fetchMock.mockResolvedValueOnce(
      ok("다음과 같습니다.\n```json\n" + JSON.stringify(messy) + "\n```\n끝"),
    );
    const { summary } = await summarize("본문");
    expect(summary.oneLine).toBe("한 줄");
    expect(summary.concepts).toHaveLength(5);
    expect(summary.definitions).toEqual([{ term: "용어2", text: "정의2" }]);
  });
});
