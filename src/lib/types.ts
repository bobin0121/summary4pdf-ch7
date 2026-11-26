// 2026-11-26 10:33 KST
import type { ErrorCode } from "./errors";

export type Summary = {
  oneLine: string;
  concepts: { name: string; description: string }[];
  definitions: { term: string; text: string }[];
};

export type SummarizeSuccess = {
  summary: Summary;
  truncated: boolean;
  model: string;
};

export type SummarizeError = {
  error: { code: ErrorCode; message: string };
};
