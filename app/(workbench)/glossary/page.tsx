import type { Metadata } from "next";
import { GlossaryWorkspace } from "@/components/glossary-workspace";

export const metadata: Metadata = { title: "용어집" };

export default function GlossaryPage() {
  return (
    <section aria-labelledby="glossary-heading">
      <div className="page-intro glossary-page-intro">
        <div>
          <p className="section-kicker">GLOSSARY</p>
          <h2 id="glossary-heading">ENSAPIA 회사 용어</h2>
          <p>고정 표기와 금지 표현을 관리하면 활성 용어만 다음 번역부터 적용됩니다.</p>
        </div>
        <span className="privacy-badge">암호화 저장 · 변경 기록</span>
      </div>

      <GlossaryWorkspace />
    </section>
  );
}
