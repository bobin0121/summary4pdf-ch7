// 2026-11-26 11:40 KST
// 화면 상태 전환(순수 함수). 컴포넌트는 useReducer로 이 함수를 쓴다.
import type { Summary } from "../lib/types";
import type { ErrorView } from "./validate";

export type State =
  | { kind: "upload"; notice?: string }
  | { kind: "loading"; file: File }
  | { kind: "result"; file: File; summary: Summary; truncated: boolean }
  | { kind: "error"; error: ErrorView; file?: File };

export type Action =
  | { type: "start"; file: File }
  | { type: "invalid"; error: ErrorView }
  | { type: "success"; file: File; summary: Summary; truncated: boolean }
  | { type: "failure"; error: ErrorView; file: File }
  | { type: "cancel" }
  | { type: "reset" };

export const initialState: State = { kind: "upload" };

// 요약 중이 아닐 때 도착한 늦은 결과(success, failure)와 취소는 무시한다.
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return state.kind === "loading" ? state : { kind: "loading", file: action.file };
    case "invalid":
      return state.kind === "loading" ? state : { kind: "error", error: action.error };
    case "success":
      return state.kind === "loading"
        ? {
            kind: "result",
            file: action.file,
            summary: action.summary,
            truncated: action.truncated,
          }
        : state;
    case "failure":
      return state.kind === "loading"
        ? { kind: "error", error: action.error, file: action.file }
        : state;
    case "cancel":
      return state.kind === "loading"
        ? { kind: "upload", notice: "요약을 취소했습니다." }
        : state;
    case "reset":
      return { kind: "upload" };
  }
}
