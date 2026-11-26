// 2026-11-26 10:33 KST
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF 요약",
  description: "PDF를 올리면 한 줄 요약과 핵심 개념을 한국어로 보여 줍니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
