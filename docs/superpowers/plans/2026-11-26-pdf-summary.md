<!-- 2026-11-26 10:27 KST -->
# PDF 요약 웹 앱 구현 계획

개정: 2026-11-26 (최종 코드 리뷰 지적을 한꺼번에 고친 뒤 코드에 맞춤)

- 근거: `docs/prd.md`, `docs/superpowers/specs/2026-11-26-pdf-summary-design.md`
- 방식: 태스크마다 담당 에이전트에게 맡기고, 끝나면 리뷰를 받는다. 워크트리를 만들지 않고 이 폴더의 새 브랜치 `feat/pdf-summary`에서 작업한다(워크트리에는 `.env`가 없음).
- 공통 규칙: `.env`를 열지 않는다. 커밋은 태스크마다 1개. 끝날 때마다 `npm test`, `npm run lint`, `npm run build`.

## 태스크 1. 프로젝트 뼈대와 공용 모듈 (backend-developer)
- Next.js 16(App Router, TypeScript, `src/`), vitest, ESLint. `.gitignore`에 Next 항목과 `samples/`를 더한다.
- `src/lib/errors.ts`: 설계 5장의 오류 코드(`TIMEOUT` 포함 8개), 상태, 문구 상수와 `ApiError` 타입, 요청이 끊겼음을 뜻하는 `ClientAbortedError`.
- `src/lib/limits.ts`: 4MB(`MAX_PDF_BYTES`), 요청 본문 한도 약 4.2MB, `%PDF-`를 찾는 앞부분 1024바이트. 서버와 화면이 함께 쓴다(unpdf를 끌어오지 않는다).
- `src/lib/types.ts`: `Summary`(`oneLine`, `concepts`, `definitions`), API 응답 타입.
- `.env.example`: `OPENROUTER_API_KEY=` 한 줄.
- 확인: `npm run build`, `npm test`(오류 상수 시험) 통과.

## 태스크 2. PDF 검사와 글자 추출 (backend-developer)
- `src/lib/pdf.ts`: `checkPdf(file)`(4MB, 확장자, 앞 1024바이트 안의 `%PDF-`), `extractText(buffer, deadline)`(`unpdf`의 `getDocumentProxy`로 쪽마다 읽다가 다듬은 글자가 30,000자를 넘으면 멈춤, 쪽 사이마다 마감을 확인해 넘기면 `TIMEOUT`), `prepareText(text)`(공백 정리, 100자 미만이면 `NO_TEXT`, 30,000자에서 자르고 `truncated`).
- 확인: 크기, 형식, 글자 없음, 자르기 단위 시험 통과.

## 태스크 3. OpenRouter 요약과 모델 대체 (ai-integration-specialist)
- `src/lib/summarize.ts`: 두 모델을 차례로, 라우트 시작 기준 전체 마감(55초) 안에서 모델마다 `min(25초, 남은 시간)`(시간 제한은 `setTimeout`과 `AbortController`, 본문 읽기가 멈춰도 빠져나옴), `summarize(text, signal, deadline)`로 요청 신호를 받아 `AbortSignal.any`로 fetch에 잇고 요청이 끊기면 다음 모델로 넘어가지 않고 멈춤, 실패(시간 초과, HTTP 오류, 빈 content, JSON 아님, 스키마 불일치)면 다음 모델. 둘 다 실패하면 429가 있었으면 `RATE_LIMITED`, 시간 초과나 마감 초과가 있었으면 `TIMEOUT`, 아니면 `AI_FAILED`. 키가 없으면 값 없이 `[summarize] missing OPENROUTER_API_KEY`만 로그. 요청에 `max_tokens: 1500`(`response_format`과 추론 옵션은 무료 모델 지원을 확인하지 못해 넣지 않음).
- 프롬프트: 한국어로만, JSON만, 한 줄 요약, 핵심 개념 1~5개, 정의와 공식. 원문은 `<document>` 태그로 감싸되 원문의 `<`, `>`를 `&lt;`, `&gt;`로 바꿔 넣어 태그를 만들거나 닫을 수 없게 하고, 태그 안 지시문은 따르지 않게 한다. JSON 꺼내기가 실패하면 다음 `{`부터 다시 시도한다.
- 응답 검증과 정규화(설계 4장 8번).
- 확인: 가짜 fetch로 대체, 시간 초과, 429, 빈 응답, 잘못된 JSON 시험 통과. 실제 API는 1회만 시험.

## 태스크 4. 요약 API 라우트 (backend-developer)
- `src/app/api/summarize/route.ts`: `multipart/form-data`의 `file`, 태스크 2와 3을 잇고 설계 5장의 상태와 코드로 응답. `maxDuration = 60`(`runtime` 줄은 두지 않는다. 기본이 Node.js), 시작 기준 전체 마감 55초를 추출과 요약에 넘김, `content-length`가 약 4.2MB를 넘으면 본문을 읽기 전에 413, `request.signal`을 요약에 넘기고 끊기면 499, 앞 1024바이트로 `%PDF-` 검사. `package.json`의 `engines`는 `24.x`. 로그에 원문과 요약을 남기지 않는다.
- 확인: 각 오류 코드와 정상 응답 시험 통과(요약 함수는 가짜).

## 태스크 5. 업로드와 결과 화면 (frontend-developer)
- `src/app/page.tsx`, `src/components/`: 설계 3장의 네 상태. 끌어다 놓기와 눌러서 선택, 브라우저 쪽 크기와 형식 검사, 30초 안내, 취소, 결과(한 줄 요약 크게, 개념, 정의와 공식), 오류 문구와 다시 시도.
- 화면 상태 전환은 순수 함수(`screenState.ts`의 `reduce`)로 빼 시험한다(새 패키지 없이). 응답 해석은 HTTP 상태도 받아 본문에 오류 코드가 없으면 504, 413, 429를 각각 `TIMEOUT`, `FILE_TOO_LARGE`, `RATE_LIMITED`로, 그 밖은 `AI_FAILED`로 본다. 요청이 취소되었거나 새 요청으로 바뀌었으면 늦게 온 결과를 버린다. 업로드로 돌아오면 업로드 영역에 포커스, 늘 있는 live 영역 하나의 글자만 바꿔 알린다.
- 깔끔한 한국어 화면, 375px 폭, 명도 대비 4.5:1, 44px 단추, 키보드 사용.
- 확인: 빌드, 린트 통과. 화면 상태별 확인.

## 태스크 6. 통합 시험과 수정 반복 (qa-engineer, 고치기는 담당 에이전트)
- backend-developer가 `samples/`에 시험 PDF(한국어, 영어, 글자 없음, 4MB 초과, PDF 아님)를 만든다.
- qa-engineer가 개발 서버로 API와 화면을 시험하고 보고한다. 찾은 문제는 담당 에이전트가 고치고 qa-engineer가 다시 확인한다. 실제 OpenRouter 호출은 몇 번만.
- 확인: 높음 문제 0건, 시험, 린트, 빌드 통과.

## 태스크 7. 깃허브와 Vercel 배포 (본 대화의 클로드와 사용자)
- 구현 중에는 하지 않는다. 브랜치를 `main`에 `--no-ff`로 합치고 `PDF_02_01`을 붙여 올린다. Vercel 배포는 7.5.6항에서 사용자와 함께 한다(환경 변수는 `OPENROUTER_API_KEY` 하나).

## 최종 코드 리뷰 반영 (개정 2026-11-26)
- 중간 6건: 전체 마감과 모델별 남은 시간(M1), 응답 해석에 HTTP 상태(M2), 요청 끊김 전달(M3), 꺾쇠 엔티티 변환(M4), `max_tokens`(M5), 시험 보강(M6: 본문 읽기 멈춤, 타이머 정리, 시간 초과와 다른 실패, 라우트 504, 한국어 추출, 우회 시도, 화면 상태 reducer).
- 사소 11건: 비동기 뒤 오래된 요청 무시, 포커스와 live 영역, 끌기 처리, 긴 낱말 줄바꿈, 결과 화면 순서와 마침표, JSON 다시 찾기, 키 없음 로그, `engines`, `content-length` 선검사, 앞 1024바이트의 `%PDF-`, 한도 상수 분리.
- 시험용 한국어 PDF는 `tests/fixtures/korean.pdf`(커밋 대상)에 둔다. `samples/`는 계속 `.gitignore`.
