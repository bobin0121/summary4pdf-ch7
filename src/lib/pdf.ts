// 2026-11-26 10:35 KST
// PDF 검사, 글자 추출, 글자 다듬기. 파일과 글자는 저장하지 않는다.
import { getDocumentProxy } from "unpdf";
import { ApiError } from "./errors";
import { MAX_PDF_BYTES } from "./limits";

export const MAX_TEXT_CHARS = 30_000;
export const MIN_TEXT_CHARS = 100;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export type PdfFileInfo = {
  name: string;
  size: number;
  /** 파일 앞부분 바이트(최대 1024바이트). `%PDF-`는 이 안 어디에 있어도 된다. */
  head: Uint8Array;
};

function hasPdfMagic(head: Uint8Array): boolean {
  for (let i = 0; i + PDF_MAGIC.length <= head.length; i++) {
    if (PDF_MAGIC.every((b, j) => head[i + j] === b)) return true;
  }
  return false;
}

export function checkPdf(file: PdfFileInfo): void {
  if (file.size > MAX_PDF_BYTES) throw new ApiError("FILE_TOO_LARGE");
  const isPdfName = file.name.toLowerCase().endsWith(".pdf");
  const hasMagic = hasPdfMagic(file.head);
  if (!isPdfName || !hasMagic) throw new ApiError("NOT_PDF");
}

function clean(text: string): string {
  return text.replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * 쪽마다 읽다가 다듬은 글자가 30,000자를 넘으면 멈춘다(큰 PDF를 끝까지 읽지 않는다).
 * 멈췄을 때 읽지 않은 쪽이 남았으면 stoppedEarly가 true. 빈 쪽은 넣지도 세지도 않는다.
 * deadline(Date.now() 기준 밀리초)을 쪽 사이마다 확인하고, 넘기면 TIMEOUT.
 */
export async function extractText(
  buffer: Uint8Array,
  deadline?: number,
): Promise<{ text: string; stoppedEarly: boolean }> {
  const checkTime = () => {
    if (deadline !== undefined && Date.now() >= deadline) {
      throw new ApiError("TIMEOUT");
    }
  };
  checkTime();
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(buffer);
    const pages: string[] = [];
    let length = 0;
    let n = 1;
    for (; n <= pdf.numPages && length <= MAX_TEXT_CHARS; n++) {
      checkTime();
      const content = await (await pdf.getPage(n)).getTextContent();
      const page = clean(
        content.items
          .filter((item) => "str" in item)
          .map((item) => item.str + (item.hasEOL ? "\n" : ""))
          .join(""),
      );
      if (!page) continue;
      pages.push(page);
      length += page.length + 1;
    }
    checkTime();
    return { text: pages.join("\n"), stoppedEarly: n <= pdf.numPages };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("PDF_UNREADABLE");
  } finally {
    void pdf?.loadingTask.destroy().catch(() => {});
  }
}

export function prepareText(text: string): { text: string; truncated: boolean } {
  const cleaned = clean(text);
  if (cleaned.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new ApiError("NO_TEXT");
  }
  if (cleaned.length > MAX_TEXT_CHARS) {
    return { text: cleaned.slice(0, MAX_TEXT_CHARS), truncated: true };
  }
  return { text: cleaned, truncated: false };
}
