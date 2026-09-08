# ENSAPIA 번역 워크벤치

ENSAPIA Seoul의 한국어↔일본어 Slack 비즈니스 메시지 번역을 위한 로컬 전용 Next.js 앱입니다.

## 준비

- Node.js 20.9 이상
- npm

```powershell
npm install
npm run db:init
```

`db:init`은 `.env.local`의 32바이트 암호화 키를 값 노출 없이 만들고, SQLite 마이그레이션과 가짜 연습용 데이터를 준비합니다. 생성된 `DATA_ENCRYPTION_KEY`를 잃으면 기존 암호화 데이터를 복구할 수 없으므로 `.env.local`은 안전한 장소에 별도로 보관하세요.

AI 기능을 연결할 때 `.env.local`에 `OPENAI_API_KEY`, `GEMINI_API_KEY`를 입력하세요. 실제 회사 메시지를 사용하기 전까지 `DATA_MODE=demo`를 유지합니다. 비밀 값은 브라우저로 전달하거나 화면에 표시하지 않습니다.

## 실행

```powershell
npm run dev
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다. 개발·운영 서버 모두 `127.0.0.1`에만 바인딩됩니다.

현재 번역 화면은 한국어·일본어 입력, 3,000자 검사, 방향 자동 감지, 진행·결과·복사·재시도 흐름을 제공합니다. 서버는 암호화된 활성 인명·용어·말투 규칙을 찾아 인명·호칭 → 회사 용어 → 상황별 말투 순으로 고정하고, 변경하지 않은 원문과 같은 규칙 목록으로 OpenAI·Gemini 1차 번역과 교차검토를 병렬 실행한 뒤 OpenAI 최종 종합과 품질검사를 거칩니다. 중간 결과는 화면에 표시하지 않고 암호화해 저장합니다.

용어집 화면에서는 원어·권장 표기·설명·금지 표기와 사용 상태를 검색·필터링하고 등록·수정할 수 있습니다. 번역에 사용되지 않은 용어만 완전히 삭제할 수 있으며, 사용 이력이 있는 용어는 중지·재활성화합니다. 화면의 `예시 파일`을 내려받아 같은 CSV 열 순서(`sourceText,targetText,direction,description,forbiddenTerms,isActive`)로 최대 500개를 가져올 수 있고 실패 행은 행 번호와 이유를 표시합니다. 모든 용어 내용과 상세 변경 기록은 암호화해 저장하며 활성 용어만 다음 번역부터 적용합니다.

기본 `DATA_MODE=demo`에서는 외부 API 비용 없이 같은 5단계 흐름을 연습용 응답으로 점검합니다. 승인된 실제 메시지와 유료 API 계정을 사용할 때만 `DATA_MODE=real`로 바꾸면 OpenAI Responses API와 Gemini Interactions API 어댑터가 실행됩니다.

데이터 연결과 14개 표의 저장 건수는 다음 명령 또는 `/settings` 화면에서 확인할 수 있습니다.

```powershell
npm run db:status
```

## 검증

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e`는 앱 서버를 자동으로 실행하며 Chromium 브라우저가 필요합니다. 최초 한 번은 `npx playwright install chromium`으로 준비할 수 있습니다.
