// 2026-11-26 11:50 KST
import { describe, expect, it } from "vitest";
import { initialState, reduce, type State } from "../src/components/screenState";
import { errorView } from "../src/components/validate";

const file = new File(["x"], "a.pdf", { type: "application/pdf" });
const summary = { oneLine: "한 줄", concepts: [], definitions: [] };
const loading: State = { kind: "loading", file };

describe("화면 상태 전환", () => {
  it("처음은 업로드", () => {
    expect(initialState).toEqual({ kind: "upload" });
  });

  it("업로드에서 시작하면 요약 중", () => {
    expect(reduce(initialState, { type: "start", file })).toEqual(loading);
  });

  it("검사에 걸리면 파일 없는 오류 상태", () => {
    const error = errorView("NOT_PDF");
    expect(reduce(initialState, { type: "invalid", error })).toEqual({
      kind: "error",
      error,
    });
  });

  it("요약 중 성공하면 결과", () => {
    expect(
      reduce(loading, { type: "success", file, summary, truncated: true }),
    ).toEqual({ kind: "result", file, summary, truncated: true });
  });

  it("요약 중 실패하면 파일을 가진 오류 상태(다시 시도 가능)", () => {
    const error = errorView("TIMEOUT");
    expect(reduce(loading, { type: "failure", error, file })).toEqual({
      kind: "error",
      error,
      file,
    });
  });

  it("요약 중 취소하면 안내와 함께 업로드", () => {
    expect(reduce(loading, { type: "cancel" })).toEqual({
      kind: "upload",
      notice: "요약을 취소했습니다.",
    });
  });

  it("취소한 뒤 늦게 온 성공과 실패는 무시한다", () => {
    const cancelled = reduce(loading, { type: "cancel" });
    expect(
      reduce(cancelled, { type: "success", file, summary, truncated: false }),
    ).toBe(cancelled);
    expect(
      reduce(cancelled, { type: "failure", error: errorView("AI_FAILED"), file }),
    ).toBe(cancelled);
  });

  it("요약 중이 아닐 때 취소는 아무 일도 없다", () => {
    expect(reduce(initialState, { type: "cancel" })).toBe(initialState);
  });

  it("요약 중에는 새 시작과 검사 오류가 상태를 바꾸지 않는다", () => {
    expect(reduce(loading, { type: "start", file })).toBe(loading);
    expect(reduce(loading, { type: "invalid", error: errorView("NOT_PDF") })).toBe(
      loading,
    );
  });

  it("결과와 오류에서 처음으로 돌아가면 알림 없는 업로드", () => {
    const result = reduce(loading, { type: "success", file, summary, truncated: false });
    expect(reduce(result, { type: "reset" })).toEqual({ kind: "upload" });
    const err = reduce(loading, { type: "failure", error: errorView("AI_FAILED"), file });
    expect(reduce(err, { type: "reset" })).toEqual({ kind: "upload" });
  });

  it("오류 상태에서 다시 시도하면 같은 파일로 요약 중", () => {
    const err = reduce(loading, { type: "failure", error: errorView("AI_FAILED"), file });
    expect(reduce(err, { type: "start", file })).toEqual(loading);
  });
});
