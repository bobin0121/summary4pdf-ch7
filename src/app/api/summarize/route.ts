// 2026-11-26 10:40 KST
// POST /api/summarize: PDF 검사, 글자 추출, AI 요약을 이어 붙인다. 파일과 요약은 저장하거나 기록하지 않는다.
import { ApiError, ClientAbortedError, ERRORS } from "../../../lib/errors";
import { MAX_REQUEST_BYTES, PDF_HEAD_BYTES } from "../../../lib/limits";
import { checkPdf, extractText, prepareText } from "../../../lib/pdf";
import { summarize } from "../../../lib/summarize";

export const maxDuration = 60;

// 라우트 시작 기준 전체 마감. maxDuration(60초)보다 짧게 둬서 우리가 먼저 TIMEOUT으로 답한다.
const DEADLINE_MS = 55_000;

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const deadline = Date.now() + DEADLINE_MS;
  try {
    // 본문을 읽기 전에 선언된 크기로 거른다.
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
      throw new ApiError("FILE_TOO_LARGE");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("BAD_REQUEST");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("BAD_REQUEST");

    const head = new Uint8Array(await file.slice(0, PDF_HEAD_BYTES).arrayBuffer());
    checkPdf({ name: file.name, size: file.size, head });

    const { text: raw, stoppedEarly } = await extractText(
      new Uint8Array(await file.arrayBuffer()),
      deadline,
    );
    const prepared = prepareText(raw);
    const text = prepared.text;
    const truncated = prepared.truncated || stoppedEarly;
    const { summary, model } = await summarize(text, request.signal, deadline);
    return Response.json({ summary, truncated, model });
  } catch (e) {
    if (e instanceof ClientAbortedError) {
      console.error("[summarize] CLIENT_ABORTED");
      return new Response(null, { status: 499 });
    }
    if (e instanceof ApiError) {
      console.error(`[summarize] ${e.code}`);
      return errorResponse(e.code, ERRORS[e.code].message, e.status);
    }
    console.error(`[summarize] UNEXPECTED ${e instanceof Error ? e.name : "unknown"}`);
    return errorResponse("INTERNAL", "잠시 후 다시 시도해 주세요.", 500);
  }
}
