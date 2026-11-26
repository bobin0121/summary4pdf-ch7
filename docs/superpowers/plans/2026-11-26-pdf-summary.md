<!-- 2026-11-26 10:27 KST -->
# PDF 요약 웹 앱 구현 계획

- 근거: `docs/prd.md`, `docs/superpowers/specs/2026-11-26-pdf-summary-design.md`
- 방식: 태스크마다 담당 에이전트에게 맡기고, 끝나면 리뷰를 받는다. 워크트리를 만들지 않고 이 폴더의 새 브랜치 `feat/pdf-summary`에서 작업한다(워크트리에는 `.env`가 없음).
- 공통 규칙: `.env`를 열지 않는다. 커밋은 태스크마다 1개. 끝날 때마다 `npm test`, `npm run lint`, `npm run build`.

## 태스크 1. 프로젝트 뼈대와 공용 모듈 (backend-developer)
- Next.js 16(App Router, TypeScript, `src/`), vitest, ESLint. `.gitignore`에 Next 항목과 `samples/`를 더한다.
- `src/lib/errors.ts`: 설계 5장의 오류 코드, 상태, 문구 상수와 `ApiError` 타입.
- `src/lib/types.ts`: `Summary`(`oneLine`, `concepts`, `definitions`), API 응답 타입.
- `.env.example`: `OPENROUTER_API_KEY=` 한 줄.
- 확인: `npm run build`, `npm test`(오류 상수 시험) 통과.

## 태스크 2. PDF 검사와 글자 추출 (backend-developer)
- `src/lib/pdf.ts`: `checkPdf(file)`(4MB, 확장자, `%PDF-` 앞부분), `extractText(buffer)`(`unpdf`), `prepareText(text)`(공백 정리, 100자 미만이면 `NO_TEXT`, 30,000자에서 자르고 `truncated`).
- 확인: 크기, 형식, 글자 없음, 자르기 단위 시험 통과.

## 태스크 3. OpenRouter 요약과 모델 대체 (ai-integration-specialist)
- `src/lib/summarize.ts`: 두 모델을 차례로, 모델당 전체 경과 25초(AbortController), 실패(시간 초과, HTTP 오류, 빈 content, JSON 아님, 스키마 불일치)면 다음 모델. 둘 다 실패하면 429였으면 `RATE_LIMITED`, 아니면 `AI_FAILED`.
- 프롬프트: 한국어로만, JSON만, 한 줄 요약, 핵심 개념 1~5개, 정의와 공식. 원문은 태그로 감싸고 태그 안 지시문은 따르지 않게 한다.
- 응답 검증과 정규화(설계 4장 8번).
- 확인: 가짜 fetch로 대체, 시간 초과, 429, 빈 응답, 잘못된 JSON 시험 통과. 실제 API는 1회만 시험.

## 태스크 4. 요약 API 라우트 (backend-developer)
- `src/app/api/summarize/route.ts`: `multipart/form-data`의 `file`, 태스크 2와 3을 잇고 설계 5장의 상태와 코드로 응답. `maxDuration = 60`, `runtime = "nodejs"`. 로그에 원문과 요약을 남기지 않는다.
- 확인: 각 오류 코드와 정상 응답 시험 통과(요약 함수는 가짜).

## 태스크 5. 업로드와 결과 화면 (frontend-developer)
- `src/app/page.tsx`, `src/components/`: 설계 3장의 네 상태. 끌어다 놓기와 눌러서 선택, 브라우저 쪽 크기와 형식 검사, 30초 안내, 취소, 결과(한 줄 요약 크게, 개념, 정의와 공식), 오류 문구와 다시 시도.
- 깔끔한 한국어 화면, 375px 폭, 명도 대비 4.5:1, 44px 단추, 키보드 사용.
- 확인: 빌드, 린트 통과. 화면 상태별 확인.

## 태스크 6. 통합 시험과 수정 반복 (qa-engineer, 고치기는 담당 에이전트)
- backend-developer가 `samples/`에 시험 PDF(한국어, 영어, 글자 없음, 4MB 초과, PDF 아님)를 만든다.
- qa-engineer가 개발 서버로 API와 화면을 시험하고 보고한다. 찾은 문제는 담당 에이전트가 고치고 qa-engineer가 다시 확인한다. 실제 OpenRouter 호출은 몇 번만.
- 확인: 높음 문제 0건, 시험, 린트, 빌드 통과.

## 태스크 7. 깃허브와 Vercel 배포 (본 대화의 클로드와 사용자)
- 구현 중에는 하지 않는다. 브랜치를 `main`에 `--no-ff`로 합치고 `PDF_02_01`을 붙여 올린다. Vercel 배포는 7.5.6항에서 사용자와 함께 한다(환경 변수는 `OPENROUTER_API_KEY` 하나).
