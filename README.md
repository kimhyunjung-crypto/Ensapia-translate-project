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

현재 번역 화면은 한국어·일본어 입력, 3,000자 검사, 방향 자동 감지, 진행·결과·복사·재시도 흐름을 제공합니다. 실제 AI 번역 연결 전에는 화면에 명시된 연습용 데모 결과를 반환하며, OpenAI·Gemini 파이프라인은 EPIC 5에서 연결합니다.

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
