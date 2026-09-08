import type { Metadata } from "next";
import { CompletionReport } from "@/components/completion-report";
import { OperationsWorkspace } from "@/components/operations-workspace";
import { ToneRulesWorkspace } from "@/components/tone-rules-workspace";
import {
  DATABASE_TABLE_LABELS,
  getDatabaseHealth,
  type DatabaseHealth,
} from "@/lib/database-health";

export const metadata: Metadata = { title: "운영 설정" };
export const runtime = "nodejs";

async function loadHealth(): Promise<DatabaseHealth | null> {
  try {
    return await getDatabaseHealth();
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const health = await loadHealth();

  return (
    <section aria-labelledby="settings-title">
      <div className="page-intro">
        <div>
          <p className="section-kicker">SETTINGS · AI · COST · DATA</p>
          <h2 id="settings-title">운영 설정</h2>
          <p>AI 연결과 비용, 저장 정책, 상황별 번역 말투를 관리합니다.</p>
        </div>
        <span className="privacy-badge">AES-256-GCM · 로컬 저장</span>
      </div>

      <OperationsWorkspace />

      <ToneRulesWorkspace />

      <CompletionReport />

      {health ? (
        <div className="system-check-grid">
          <article className="system-check-card system-check-summary">
            <div className="system-check-heading">
              <span className="health-indicator" aria-hidden="true" />
              <div>
                <p className="section-kicker">DATABASE CHECK</p>
                <h3>데이터 연결 성공</h3>
              </div>
            </div>
            <p>
              SQLite의 {health.tableCount}개 데이터 표에 연결했습니다. 회사 용어, 인명과 번역 내용은
              암호화된 값으로 저장됩니다.
            </p>
          </article>

          <article className="system-check-card sample-card">
            <p className="section-kicker">DEMO DATA</p>
            <h3>연습용 자료</h3>
            <dl className="sample-list">
              <div><dt>용어</dt><dd>{health.samples.glossary ?? "없음"}</dd></div>
              <div><dt>가상 인명</dt><dd>{health.samples.person ?? "없음"}</dd></div>
              <div><dt>말투</dt><dd>{health.samples.tone ?? "없음"}</dd></div>
              <div><dt>가짜 메시지</dt><dd>{health.samples.message ?? "없음"}</dd></div>
            </dl>
            <p className="demo-disclaimer">표시된 내용은 개발·테스트용 가상 자료이며 실제 개인정보가 아닙니다.</p>
          </article>

          <article className="system-check-card table-count-card">
            <p className="section-kicker">TABLE COUNTS</p>
            <h3>표별 저장 건수</h3>
            <ul className="table-count-list">
              {(Object.keys(DATABASE_TABLE_LABELS) as Array<keyof typeof DATABASE_TABLE_LABELS>).map(
                (name) => (
                  <li key={name}>
                    <span>{DATABASE_TABLE_LABELS[name]}</span>
                    <strong>{health.counts[name]}건</strong>
                  </li>
                ),
              )}
            </ul>
          </article>
        </div>
      ) : (
        <article className="system-check-card system-check-error" role="status">
          <p className="section-kicker">DATABASE CHECK</p>
          <h3>데이터 초기화가 필요합니다</h3>
          <p>
            터미널에서 <code>npm run db:init</code>을 실행한 뒤 이 화면을 새로고침해 주세요. 비밀 값이나
            입력 원문은 오류 화면에 표시되지 않습니다.
          </p>
        </article>
      )}
    </section>
  );
}
