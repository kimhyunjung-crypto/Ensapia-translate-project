import type { Metadata } from "next";
import { TranslationWorkspace } from "@/components/translation-workspace";

export const metadata: Metadata = { title: "번역" };

export default function TranslatePage() {
  return (
    <section aria-labelledby="translate-heading">
      <div className="page-intro">
        <div>
          <p className="section-kicker">TRANSLATE</p>
          <h2 id="translate-heading">Slack 메시지를 입력하세요</h2>
          <p>한국어와 일본어를 자동으로 감지하고 ENSAPIA 표현 기준을 적용합니다.</p>
        </div>
        <span className="privacy-badge">127.0.0.1 로컬 작업 공간</span>
      </div>

      <TranslationWorkspace />
    </section>
  );
}
