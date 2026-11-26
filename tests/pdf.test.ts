// 2026-11-26 10:35 KST
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/lib/errors";
import { readFileSync } from "node:fs";
import { checkPdf, extractText, prepareText } from "../src/lib/pdf";

const enc = new TextEncoder();
const PDF_HEAD = enc.encode("%PDF-1.4\n");

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? e.code : "OTHER";
  }
  return undefined;
}

// 글자 하나가 든 최소 PDF를 직접 만든다(xref는 pdf.js가 복구한다).
function minimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const body =
    "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n` +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
    "trailer<</Root 1 0 R/Size 6>>\n%%EOF\n";
  return enc.encode(body);
}

// 쪽마다 글자 하나가 든 여러 쪽 PDF.
function multiPagePdf(pages: string[]): Uint8Array {
  const n = pages.length;
  let body = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n";
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  body += `2 0 obj<</Type/Pages/Kids[${kids}]/Count ${n}>>endobj\n`;
  pages.forEach((t, i) => {
    const pageId = 3 + i * 2;
    // 100자씩 줄을 나눠 쓴다(한 줄이 너무 길면 pdf.js가 일부를 버린다).
    const stream = (t.match(/.{1,100}/g) ?? [])
      .map((line, k) => `BT /F1 8 Tf 5 ${1990 - 10 * k} Td (${line}) Tj ET`)
      .join("\n");
    body += `${pageId} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 1000 2000]/Contents ${pageId + 1} 0 R/Resources<</Font<</F1 ${3 + n * 2} 0 R>>>>>>endobj\n`;
    body += `${pageId + 1} 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n`;
  });
  body += `${3 + n * 2} 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n`;
  body += `trailer<</Root 1 0 R/Size ${4 + n * 2}>>\n%%EOF\n`;
  return enc.encode(body);
}

describe("checkPdf", () => {
  it("정상 PDF는 통과한다", () => {
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: 1000, head: PDF_HEAD }))).toBeUndefined();
  });

  it("4MB 정확히는 통과하고 1바이트 넘으면 FILE_TOO_LARGE", () => {
    const max = 4 * 1024 * 1024;
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: max, head: PDF_HEAD }))).toBeUndefined();
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: max + 1, head: PDF_HEAD }))).toBe("FILE_TOO_LARGE");
  });

  it("확장자가 .pdf가 아니면 NOT_PDF", () => {
    expect(codeOf(() => checkPdf({ name: "a.txt", size: 10, head: PDF_HEAD }))).toBe("NOT_PDF");
  });

  it("앞부분이 %PDF-가 아니면 NOT_PDF", () => {
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: 10, head: enc.encode("hello world") }))).toBe("NOT_PDF");
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: 0, head: new Uint8Array() }))).toBe("NOT_PDF");
  });

  it("%PDF-가 앞 1024바이트 안에 있으면 통과, 밖이면 NOT_PDF", () => {
    const pad = (n: number) => new Uint8Array(n).fill(0x20);
    const withMagicAt = (n: number) => {
      const head = new Uint8Array(1024);
      head.set(pad(n));
      head.set(enc.encode("%PDF-1.7").subarray(0, Math.min(8, 1024 - n)), n);
      return head;
    };
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: 2000, head: withMagicAt(100) }))).toBeUndefined();
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: 2000, head: withMagicAt(1019) }))).toBeUndefined();
    expect(codeOf(() => checkPdf({ name: "a.pdf", size: 2000, head: new Uint8Array(1024).fill(0x20) }))).toBe("NOT_PDF");
  });

  it("확장자 대소문자는 가리지 않는다", () => {
    expect(codeOf(() => checkPdf({ name: "A.PDF", size: 10, head: PDF_HEAD }))).toBeUndefined();
  });
});

describe("extractText", () => {
  it("PDF에서 글자를 뽑는다", async () => {
    const { text, stoppedEarly } = await extractText(minimalPdf("Hello Summary"));
    expect(stoppedEarly).toBe(false);
    expect(text).toContain("Hello Summary");
  });

  it("한국어 PDF에서 한글을 뽑는다", async () => {
    const buf = new Uint8Array(readFileSync("tests/fixtures/korean.pdf"));
    const { text } = await extractText(buf);
    expect(text).toMatch(/[가-힣]{5,}/);
  });

  it("마감이 이미 지났으면 TIMEOUT", async () => {
    await expect(
      extractText(minimalPdf("Hello Summary"), Date.now() - 1),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("마감 전이면 정상으로 읽는다", async () => {
    const { text } = await extractText(minimalPdf("Hello Summary"), Date.now() + 60_000);
    expect(text).toContain("Hello Summary");
  });

  it("30,000자를 넘으면 나머지 쪽은 읽지 않는다", async () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      String.fromCharCode(65 + i).repeat(5000),
    );
    const { text, stoppedEarly } = await extractText(multiPagePdf(pages));
    expect(stoppedEarly).toBe(true);
    const count = (ch: string) => text.split(ch).length - 1;
    expect(count("A")).toBe(5000);
    expect(count("F")).toBe(5000); // 6쪽째에서 30,000자를 넘어 멈춘다
    expect(count("G")).toBe(0);
    expect(count("J")).toBe(0);
    const { text: out, truncated } = prepareText(text);
    expect(truncated).toBe(true);
    expect(out).toHaveLength(30_000);
  });

  it("마지막 쪽에서 한도를 넘기면 stoppedEarly는 false", async () => {
    const pages = ["A".repeat(15_000), "B".repeat(15_001)];
    const { text, stoppedEarly } = await extractText(multiPagePdf(pages));
    expect(stoppedEarly).toBe(false);
    expect(text.split("B").length - 1).toBe(15_001);
  });

  it("빈 쪽은 넣지도 세지도 않는다", async () => {
    const pages = ["A".repeat(100), "", "", "B".repeat(100)];
    const { text, stoppedEarly } = await extractText(multiPagePdf(pages));
    expect(stoppedEarly).toBe(false);
    expect(text).toBe("A".repeat(100) + "\n" + "B".repeat(100));
  });

  it("깨진 파일은 PDF_UNREADABLE", async () => {
    await expect(extractText(enc.encode("%PDF-1.4 not really a pdf"))).rejects.toMatchObject({
      code: "PDF_UNREADABLE",
    });
  });
});

describe("prepareText", () => {
  it("공백을 정리한다", () => {
    const raw = "가".repeat(60) + "   \t  " + "나".repeat(60) + "\n\n\n  " + "다".repeat(5);
    const { text, truncated } = prepareText(raw);
    expect(text).toBe("가".repeat(60) + " " + "나".repeat(60) + "\n" + "다".repeat(5));
    expect(truncated).toBe(false);
  });

  it("공백 뺀 글자가 100자 미만이면 NO_TEXT", () => {
    expect(codeOf(() => prepareText(""))).toBe("NO_TEXT");
    expect(codeOf(() => prepareText("가 ".repeat(99)))).toBe("NO_TEXT");
    expect(codeOf(() => prepareText(("가 ".repeat(100)).trim()))).toBeUndefined();
  });

  it("30,000자 이하는 그대로, 넘으면 자르고 truncated", () => {
    const exact = "a".repeat(30_000);
    expect(prepareText(exact)).toEqual({ text: exact, truncated: false });
    const over = prepareText("a".repeat(30_001));
    expect(over.text).toHaveLength(30_000);
    expect(over.truncated).toBe(true);
  });
});
