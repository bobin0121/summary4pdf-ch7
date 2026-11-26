// 2026-11-26 11:34 KST
// 서버와 화면이 함께 쓰는 크기 한도. unpdf 같은 서버 전용 모듈을 끌어오지 않는다.

/** PDF 파일 크기 한도. Vercel 요청 본문 한도(4.5MB)보다 작게 둔다. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/** 요청 본문(multipart 포함) 한도, 약 4.2MB. content-length로 본문을 읽기 전에 거른다. */
export const MAX_REQUEST_BYTES = MAX_PDF_BYTES + 200 * 1024;

/** `%PDF-`를 찾는 파일 앞부분 바이트 수. */
export const PDF_HEAD_BYTES = 1024;
