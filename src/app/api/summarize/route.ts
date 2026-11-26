// 2026-11-26 10:40 KST
// POST /api/summarize: PDF 검사, 글자 추출, AI 요약을 이어 붙인다. 파일과 요약은 저장하거나 기록하지 않는다.
import { ApiError, ERRORS } from "../../../lib/errors";
import { checkPdf, extractText, prepareText } from "../../../lib/pdf";
import { summarize } from "../../../lib/summarize";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("BAD_REQUEST");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("BAD_REQUEST");

    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    checkPdf({ name: file.name, size: file.size, head });

    const raw = await extractText(new Uint8Array(await file.arrayBuffer()));
    const { text, truncated } = prepareText(raw);
    const { summary, model } = await summarize(text);
    return Response.json({ summary, truncated, model });
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`[summarize] ${e.code}`);
      return errorResponse(e.code, ERRORS[e.code].message, e.status);
    }
    console.error(`[summarize] UNEXPECTED ${e instanceof Error ? e.name : "unknown"}`);
    return errorResponse("INTERNAL", "잠시 후 다시 시도해 주세요.", 500);
  }
}
