// 2026-11-26 10:35 KST
// PDF 검사, 글자 추출, 글자 다듬기. 파일과 글자는 저장하지 않는다.
import { extractText as unpdfExtractText } from "unpdf";
import { ApiError } from "./errors";

export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 30_000;
export const MIN_TEXT_CHARS = 100;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export type PdfFileInfo = {
  name: string;
  size: number;
  /** 파일 앞부분 바이트(최소 5바이트). */
  head: Uint8Array;
};

export function checkPdf(file: PdfFileInfo): void {
  if (file.size > MAX_PDF_BYTES) throw new ApiError("FILE_TOO_LARGE");
  const isPdfName = file.name.toLowerCase().endsWith(".pdf");
  const hasMagic = PDF_MAGIC.every((b, i) => file.head[i] === b);
  if (!isPdfName || !hasMagic) throw new ApiError("NOT_PDF");
}

export async function extractText(buffer: Uint8Array): Promise<string> {
  try {
    const { text } = await unpdfExtractText(buffer, { mergePages: true });
    return text;
  } catch {
    throw new ApiError("PDF_UNREADABLE");
  }
}

export function prepareText(text: string): { text: string; truncated: boolean } {
  const cleaned = text.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  if (cleaned.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new ApiError("NO_TEXT");
  }
  if (cleaned.length > MAX_TEXT_CHARS) {
    return { text: cleaned.slice(0, MAX_TEXT_CHARS), truncated: true };
  }
  return { text: cleaned, truncated: false };
}
