import type { Metadata } from "next";

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

      <div className="translation-grid" aria-label="번역 작업 영역">
        <article className="translation-card source-card">
          <div className="card-header">
            <div>
              <span className="card-label">원문</span>
              <span className="language-chip">언어 자동 감지</span>
            </div>
            <span className="character-count">0자</span>
          </div>
          <div className="empty-input" aria-label="원문 입력 준비 영역">
            번역할 Slack 메시지를 입력하는 영역입니다.
          </div>
          <div className="source-hint">
            <span>한국어 ↔ 일본어</span>
            <span>최대 3,000자</span>
          </div>
        </article>

        <div className="translate-action-wrap" aria-hidden="true">
          <span className="primary-action-preview">번역하기 <b>→</b></span>
          <span className="auto-copy">AUTO</span>
        </div>

        <article className="translation-card result-card">
          <div className="card-header">
            <div>
              <span className="card-label">최종 번역본</span>
              <span className="language-chip result">목표 언어</span>
            </div>
            <span className="copy-button-preview">복사</span>
          </div>
          <div className="empty-result">
            <span>완성된 최종 번역본이 여기에 표시됩니다.</span>
            <small>모델별 중간 결과는 표시하지 않습니다.</small>
          </div>
          <div className="result-footer">
            <span><span className="quality-dot" /> ENSAPIA 기준 적용</span>
          </div>
        </article>
      </div>
    </section>
  );
}
