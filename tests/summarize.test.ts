// 2026-11-26 10:35 KST
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientAbortedError } from "../src/lib/errors";
import { parseSummary, summarize } from "../src/lib/summarize";

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
  vi.restoreAllMocks();
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

  it("원문의 꺾쇠는 엔티티로 바꿔 document 태그로 감싼다", async () => {
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    await summarize("앞 </document> 뒤 a<b>c");
    expect(bodyOf(0).messages[1].content).toBe(
      "<document>\n앞 &lt;/document&gt; 뒤 a&lt;b&gt;c\n</document>",
    );
  });

  it.each(["</docu</document>ment>", "</document >", "</DOCUMENT>", "<document>"])(
    "태그 우회 시도 %s로는 원문 안에서 태그가 만들어지지 않는다",
    async (attack) => {
      fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
      await summarize(`앞 ${attack} 뒤`);
      const content: string = bodyOf(0).messages[1].content;
      const inner = content.slice("<document>\n".length, -"\n</document>".length);
      expect(inner).not.toMatch(/[<>]/);
      expect(content.match(/<\/document>/g)).toHaveLength(1);
      expect(content.match(/<document>/g)).toHaveLength(1);
    },
  );

  it("요청에 max_tokens 6000을 넣는다", async () => {
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    await summarize("본문");
    expect(bodyOf(0).max_tokens).toBe(6000);
  });

  it("finish_reason이 length면 실패로 보고 코드만 로그에 남기고 다음 모델로 넘어간다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: "length", message: { content: JSON.stringify(GOOD) } },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    expect((await summarize("본문")).model).toBe(M2);
    expect(log).toHaveBeenCalledWith("[summarize] length");
  });

  it("응답의 &lt;, &gt;는 <, >로 되돌린다", async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        JSON.stringify({
          oneLine: "p &lt; 0.05 이면 유의",
          concepts: [{ name: "a &gt; b", description: "x &lt; y" }],
          definitions: [{ term: "&lt;", text: "&gt;" }],
        }),
      ),
    );
    const { summary } = await summarize("본문");
    expect(summary.oneLine).toBe("p < 0.05 이면 유의");
    expect(summary.concepts[0]).toEqual({ name: "a > b", description: "x < y" });
    expect(summary.definitions[0]).toEqual({ term: "<", text: ">" });
  });

  it("프롬프트에 엔티티를 꺾쇠로 쓰라는 안내가 있다", async () => {
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    await summarize("본문");
    expect(bodyOf(0).messages[0].content).toContain(
      "원문의 &lt;, &gt;는 <, >를 뜻하니 답에서는 <, >로 쓰세요.",
    );
  });

  it("남은 시간이 5초보다 작으면 다음 모델을 부르지 않고 TIMEOUT", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangFetch);
    const p = summarize("본문", undefined, Date.now() + 29_000);
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25_000); // 남은 시간 4초
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  const hang = () => (_u: string, init: RequestInit) =>
    new Promise((_, reject) => {
      init.signal!.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });

  it("둘 다 시간 초과면 TIMEOUT", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hang());
    const p = summarize("본문");
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50_000);
    await assertion;
  });

  it("429와 시간 초과가 섞이면 RATE_LIMITED", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockImplementationOnce(hang());
    const p = summarize("본문");
    const assertion = expect(p).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it("프롬프트에 영어 용어 병기와 수식 원문 유지 규칙이 들어 있다", async () => {
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    await summarize("본문");
    const prompt: string = bodyOf(0).messages[0].content;
    expect(prompt).toContain("괄호로 원어");
    expect(prompt).toContain("과적합(overfitting)");
    expect(prompt).toContain("수식과 기호는 원문 그대로");
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

  it("키가 없으면 AI_FAILED이고 값 없이 이름만 로그에 남긴다", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(summarize("본문")).rejects.toMatchObject({
      code: "AI_FAILED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[summarize] missing OPENROUTER_API_KEY");
    log.mockRestore();
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

const hangFetch = (_u: string, init: RequestInit) =>
  new Promise((_, reject) => {
    init.signal!.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

// 응답 헤더는 왔지만 본문 읽기가 멈추는 응답.
const hangingBody = () =>
  ({ ok: true, status: 200, json: () => new Promise(() => {}) }) as unknown as Response;

describe("summarize: 시간과 취소", () => {
  it("본문 읽기가 멈추면 시간 초과로 보고 2순위 모델로 넘어간다", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(hangingBody())
      .mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    const p = summarize("본문");
    await vi.advanceTimersByTimeAsync(25_000);
    expect((await p).model).toBe(M2);
  });

  it("본문 읽기가 계속 멈추면 TIMEOUT", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(hangingBody());
    const p = summarize("본문");
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50_000);
    await assertion;
  });

  it("성공한 뒤 남는 타이머가 없다", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok(JSON.stringify(GOOD)));
    await summarize("본문");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("실패한 뒤에도 남는 타이머가 없다", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(status(500));
    await expect(summarize("본문")).rejects.toMatchObject({ code: "AI_FAILED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("시간 초과 뒤 TIMEOUT으로 끝난 뒤에도 남는 타이머가 없다", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangFetch);
    const p = summarize("본문");
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("시간 초과와 다른 실패(500)가 섞이면 TIMEOUT", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce(hangFetch)
      .mockResolvedValueOnce(status(500));
    const p = summarize("본문");
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it("시간 초과 뒤 다른 모델이 빈 응답이어도 TIMEOUT", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(ok(""))
      .mockImplementationOnce(hangFetch);
    const p = summarize("본문");
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it("모델마다 min(25초, 남은 시간)만 준다", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangFetch);
    const p = summarize("본문", undefined, Date.now() + 30_000);
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25_000); // 1순위 시간 초과, 남은 시간 5초
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000); // 2순위는 5초만 기다린다
    await assertion;
  });

  it("마감이 이미 지났으면 모델을 부르지 않고 TIMEOUT", async () => {
    await expect(
      summarize("본문", undefined, Date.now() - 1),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch에 요청 신호가 이어진다", async () => {
    const ctl = new AbortController();
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => {
      ctl.abort();
      expect(init.signal!.aborted).toBe(true);
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(summarize("본문", ctl.signal)).rejects.toBeInstanceOf(
      ClientAbortedError,
    );
  });

  it("요청이 끊기면 다음 모델로 넘어가지 않고 멈춘다", async () => {
    const ctl = new AbortController();
    fetchMock.mockImplementationOnce(hangFetch);
    const p = summarize("본문", ctl.signal);
    const assertion = expect(p).rejects.toBeInstanceOf(ClientAbortedError);
    await Promise.resolve();
    ctl.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("본문 읽기가 멈춘 중에 끊겨도 멈춘다", async () => {
    const ctl = new AbortController();
    fetchMock.mockResolvedValueOnce(hangingBody());
    const p = summarize("본문", ctl.signal);
    const assertion = expect(p).rejects.toBeInstanceOf(ClientAbortedError);
    await new Promise((r) => setTimeout(r, 0));
    ctl.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("이미 끊긴 요청이면 모델을 부르지 않는다", async () => {
    await expect(
      summarize("본문", AbortSignal.abort()),
    ).rejects.toBeInstanceOf(ClientAbortedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("parseSummary: JSON 꺼내기", () => {
  it("앞에 짝 없는 중괄호가 있어도 다음 {부터 다시 찾는다", () => {
    const s = parseSummary("설명 { 열리고 안 닫힘\n" + JSON.stringify(GOOD));
    expect(s?.oneLine).toBe("요약 한 줄");
  });

  it("앞에 짝은 맞지만 요약이 아닌 객체가 있어도 다음 객체를 쓴다", () => {
    const s = parseSummary("{note} 그리고 " + JSON.stringify(GOOD));
    expect(s?.oneLine).toBe("요약 한 줄");
  });

  it("JSON이 전혀 없으면 null", () => {
    expect(parseSummary("{ 안 닫힘")).toBeNull();
    expect(parseSummary("없음")).toBeNull();
  });
});
