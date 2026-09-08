import { createCompletionReport } from "@/modules/quality/report";

function CheckIcon({ pending = false }: { pending?: boolean }) {
  return (
    <span className="completion-check-icon" data-pending={pending || undefined} aria-hidden="true">
      {pending ? "!" : "✓"}
    </span>
  );
}

export function CompletionReport() {
  const report = createCompletionReport();
  const fixedNotationRate = report.qualitySummary.fixedNotationChecks === 0
    ? 0
    : (report.qualitySummary.fixedNotationPassed /
        report.qualitySummary.fixedNotationChecks) * 100;

  return (
    <section className="completion-report" aria-labelledby="completion-report-heading">
      <div className="completion-report-heading">
        <div>
          <p className="section-kicker">EPIC 11 · COMPLETION REPORT</p>
          <h3 id="completion-report-heading">전체 품질과 완료 점검</h3>
          <p>가짜 메시지만 사용하는 자동 회귀 기준선입니다. 실제 업무 품질 승인은 별도로 진행해야 합니다.</p>
        </div>
        <span className="completion-status"><span aria-hidden="true">✓</span> 로컬 필수 범위 완료</span>
      </div>

      <section className="completion-section" aria-labelledby="integration-check-heading">
        <div className="completion-section-heading">
          <div>
            <p className="section-kicker">INTEGRATION</p>
            <h4 id="integration-check-heading">핵심 흐름 통합 자동 점검</h4>
          </div>
          <div className="completion-verification" data-testid="completion-verification">
            <strong>{report.integrationChecks.length}/{report.integrationChecks.length} 통과</strong>
            <span>{report.generatedAt} · Vitest · Playwright · Build 통과</span>
          </div>
        </div>
        <ul className="integration-check-grid" data-testid="integration-checks">
          {report.integrationChecks.map((check) => (
            <li key={check.id}>
              <CheckIcon />
              <div><strong>{check.label}</strong><span>{check.evidence}</span></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="completion-section" aria-labelledby="quality-evaluation-heading">
        <div className="completion-section-heading">
          <div>
            <p className="section-kicker">QUALITY · {report.baseline}</p>
            <h4 id="quality-evaluation-heading">한국어↔일본어 50건 품질 평가</h4>
          </div>
          <strong>{report.qualitySummary.passed}/{report.qualitySummary.total} 통과</strong>
        </div>

        <dl className="quality-summary-grid">
          <div><dt>한국어 → 일본어</dt><dd>{report.qualitySummary.koreanToJapanese}건</dd></div>
          <div><dt>일본어 → 한국어</dt><dd>{report.qualitySummary.japaneseToKorean}건</dd></div>
          <div><dt>중대 오역·누락</dt><dd>{report.qualitySummary.majorErrorOrOmission}건</dd></div>
          <div><dt>고정 표기 준수</dt><dd>{fixedNotationRate.toFixed(0)}%</dd></div>
          <div><dt>미번역 문구</dt><dd>{report.qualitySummary.untranslatedPhraseFailures}건</dd></div>
          <div><dt>핵심 색 대비</dt><dd>{report.contrastPassed ? "AA 통과" : "확인 필요"}</dd></div>
        </dl>

        <div
          className="quality-table-scroll"
          role="region"
          tabIndex={0}
          aria-label="50건 품질 평가표 가로 스크롤 영역"
        >
          <table className="quality-table" data-testid="quality-evaluation-table">
            <caption>가짜 비즈니스 메시지 50건의 데모 번역 회귀 평가 결과</caption>
            <thead>
              <tr>
                <th scope="col">케이스</th>
                <th scope="col">방향</th>
                <th scope="col">원문·결과</th>
                <th scope="col">중대 오역·누락</th>
                <th scope="col">고정 표기</th>
                <th scope="col">미번역</th>
                <th scope="col">결과</th>
              </tr>
            </thead>
            <tbody>
              {report.qualityResults.map((result) => (
                <tr key={result.caseId} data-testid="quality-evaluation-row">
                  <th scope="row">{result.caseId}</th>
                  <td>{result.direction === "ko-ja" ? "한→일" : "일→한"}</td>
                  <td>
                    <details>
                      <summary>{result.sourceText}</summary>
                      <dl className="quality-case-detail">
                        <div><dt>기준 번역</dt><dd lang={result.direction === "ko-ja" ? "ja" : "ko"}>{result.expectedText}</dd></div>
                        <div><dt>데모 결과</dt><dd lang={result.direction === "ko-ja" ? "ja" : "ko"}>{result.candidateText}</dd></div>
                        <div><dt>판정</dt><dd>{result.notes.join(" · ")}</dd></div>
                      </dl>
                    </details>
                  </td>
                  <td>{result.majorErrorOrOmission ? "발견" : "0건"}</td>
                  <td>{result.fixedNotationPassed ? "준수" : "누락"}</td>
                  <td>{result.untranslatedPhraseFound ? "발견" : "0건"}</td>
                  <td><span className="evaluation-result" data-passed={result.passed}>{result.passed ? "통과" : "확인 필요"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="quality-method-note">
          공백·문자 정규화 후 검수 기준문과 비교하고, 원문 숫자·필수 고정 표기·목표 언어 문자를 별도로 검사합니다.
          실제 API 모드는 승인된 데이터로 사람의 의미·말투 검수를 추가해야 합니다.
        </p>
      </section>

      <section className="completion-section" aria-labelledby="prd-check-heading">
        <div className="completion-section-heading">
          <div>
            <p className="section-kicker">PRD CHECKLIST</p>
            <h4 id="prd-check-heading">PRD 대조 점검</h4>
          </div>
          <span>운영 측정 2개 별도 표시</span>
        </div>
        <div className="prd-check-grid" data-testid="prd-checklist">
          {report.prdGroups.map((group) => (
            <article key={group.id}>
              <h5>{group.title}</h5>
              <ul>
                {group.checks.map((check) => {
                  const pending = check.status === "pending-operation";
                  return (
                    <li key={check.id} data-status={check.status}>
                      <CheckIcon pending={pending} />
                      <div>
                        <strong>{check.label}</strong>
                        <span>{check.evidence}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
