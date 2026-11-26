// 2026-11-26 10:35 KST
"use client";

import { useEffect, useRef, useState } from "react";
import type { Summary } from "../lib/types";
import {
  NETWORK_ERROR,
  type ErrorView,
  formatSize,
  parseResponse,
  validateFile,
} from "./validate";

type State =
  | { kind: "upload"; notice?: string }
  | { kind: "loading"; file: File }
  | { kind: "result"; file: File; summary: Summary; truncated: boolean }
  | { kind: "error"; error: ErrorView; file?: File };

export default function PdfSummarizer() {
  const [state, setState] = useState<State>({ kind: "upload" });
  const [dragging, setDragging] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loading = state.kind === "loading";

  useEffect(() => {
    if (!loading) return;
    const begin = Date.now();
    const id = setInterval(
      () => setSeconds(Math.floor((Date.now() - begin) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [loading]);

  // F1: 업로드 영역 밖에 파일을 놓아도 브라우저가 파일을 열지 않게 한다.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // 상태가 바뀌면 새 제목으로 포커스를 옮겨 화면 낭독기가 알리게 한다.
  useEffect(() => {
    if (state.kind !== "upload") headingRef.current?.focus();
  }, [state.kind]);

  async function start(file: File) {
    const problem = validateFile(file);
    if (problem) {
      setState({ kind: "error", error: problem });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSeconds(0);
    setState({ kind: "loading", file });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/summarize", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const parsed = parseResponse(res.ok, body);
      if (parsed.ok) {
        setState({
          kind: "result",
          file,
          summary: parsed.data.summary,
          truncated: parsed.data.truncated,
        });
      } else {
        setState({ kind: "error", error: parsed.error, file });
      }
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof DOMException && e.name === "AbortError")
      ) {
        setState({ kind: "upload", notice: "요약을 취소했습니다." });
      } else {
        setState({ kind: "error", error: NETWORK_ERROR, file });
      }
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (file) void start(file);
  }

  function reset() {
    setState({ kind: "upload" });
  }

  return (
    <div className="card">
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => pick(e.target.files)}
      />

      {state.kind === "upload" && (
        <section aria-labelledby="t-upload">
          <h1 id="t-upload">PDF 요약</h1>
          <p className="lead">
            강의 자료나 논문 PDF를 올리면 핵심 내용을 한국어로 요약해 드립니다.
          </p>
          <div
            className={`dropzone${dragging ? " dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-describedby="limit privacy"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
          >
            <strong>
              {dragging ? "놓으면 올라갑니다." : "PDF 파일을 여기로 끌어다 놓으세요."}
            </strong>
            <span>또는 눌러서 파일을 선택하세요.</span>
          </div>
          <p id="limit" className="hint">
            PDF만 올릴 수 있고, 크기는 4MB까지입니다. 글자를 복사할 수 있는 PDF만
            요약됩니다.
          </p>
          <p id="privacy" className="hint">
            올린 파일은 저장되지 않습니다. 올린 PDF의 글자는 요약을 위해 외부 AI
            서비스로 전달됩니다.
          </p>
          <p className="notice" role="status" aria-live="polite">
            {state.notice}
          </p>
        </section>
      )}

      {state.kind === "loading" && (
        <section aria-labelledby="t-load">
          <h1 id="t-load" tabIndex={-1} ref={headingRef}>
            요약하는 중입니다
          </h1>
          <p className="file">
            {state.file.name} ({formatSize(state.file.size)})
          </p>
          <div className="spinner-row">
            <span className="spinner" aria-hidden="true" />
            <span>{seconds}초 지났습니다</span>
          </div>
          <p role="status" aria-live="polite" className="hint">
            요약하는 중입니다. 문서 길이와 서버 상황에 따라 시간이 걸릴 수 있습니다.
          </p>
          {seconds >= 30 && (
            <p role="status" aria-live="polite" className="hint">
              무료 AI 모델을 쓰고 있어 평소보다 오래 걸릴 수 있습니다. 조금만
              기다려 주세요.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => abortRef.current?.abort()}
            >
              취소
            </button>
          </div>
        </section>
      )}

      {state.kind === "result" && (
        <section aria-labelledby="t-result">
          <h1 id="t-result" tabIndex={-1} ref={headingRef}>
            요약 결과
          </h1>
          <p className="file">{state.file.name}</p>
          {state.truncated && <p className="badge">앞부분만 요약했습니다</p>}
          <h2>한 줄 요약</h2>
          <p className="oneline">{state.summary.oneLine}</p>
          <h2>핵심 개념</h2>
          <ul className="cards">
            {state.summary.concepts.map((c, i) => (
              <li key={i} className="concept">
                <h3>{c.name}</h3>
                <p>{c.description}</p>
              </li>
            ))}
          </ul>
          <h2>중요한 정의와 공식</h2>
          {state.summary.definitions.length === 0 ? (
            <p className="hint">이 문서에서 뚜렷한 정의나 공식을 찾지 못했습니다.</p>
          ) : (
            <dl className="defs">
              {state.summary.definitions.map((d, i) => (
                <div key={i}>
                  <dt>{d.term}</dt>
                  <dd className="mono">{d.text}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="hint">
            AI가 만든 요약이므로 중요한 내용은 원문과 함께 확인하세요.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={reset}>
              다른 PDF 올리기
            </button>
          </div>
        </section>
      )}

      {state.kind === "error" && (
        <section aria-labelledby="t-error">
          <h1 id="t-error" tabIndex={-1} ref={headingRef}>
            {state.error.title}
          </h1>
          <p className="error" role="alert">
            {state.error.message}
          </p>
          <div className="actions">
            {state.error.retry === "retry" && state.file ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void start(state.file!)}
                >
                  다시 시도
                </button>
                <button type="button" className="btn secondary" onClick={reset}>
                  다른 파일 올리기
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={reset}>
                다시 올리기
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
