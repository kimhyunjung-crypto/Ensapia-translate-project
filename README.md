# ENSAPIA 번역 워크벤치

ENSAPIA Seoul의 한국어↔일본어 Slack 비즈니스 메시지 번역을 위한 로컬 전용 Next.js 앱입니다.

## 준비

- Node.js 20.9 이상
- npm

```powershell
npm install
Copy-Item .env.example .env.local
```

`.env.local`에 `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DATA_ENCRYPTION_KEY`를 입력하세요. 실제 회사 메시지를 사용하기 전까지 `DATA_MODE=demo`를 유지합니다. 비밀 값은 브라우저로 전달하거나 화면에 표시하지 않습니다.

## 실행

```powershell
npm run dev
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다. 개발·운영 서버 모두 `127.0.0.1`에만 바인딩됩니다.

## 검증

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e`는 앱 서버를 자동으로 실행하며 Chromium 브라우저가 필요합니다. 최초 한 번은 `npx playwright install chromium`으로 준비할 수 있습니다.
