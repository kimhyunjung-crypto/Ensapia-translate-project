"use client";

import { useEffect, useRef, useState } from "react";

type ProviderStatus = {
  provider: "openai" | "gemini";
  connected: boolean;
  message: string;
};

type ModelConfiguration = {
  key: string;
  label: string;
  provider: "openai" | "gemini";
  stage: "draft" | "review" | "final";
  modelId: string;
  promptVersionId: string;
  promptVersion: string;
};

type Price = {
  id: string;
  provider: string;
  modelId: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

type UsageSummary = {
  translations: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byProvider: Array<{
    provider: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }>;
};

type Operations = {
  dataMode: "demo" | "real";
  providers: ProviderStatus[];
  configurations: ModelConfiguration[];
  prices: Price[];
  costPolicy: { monthlyLimitUsd: number; warningAtUsd: number };
  usage: {
    last: (UsageSummary & { jobId: string; occurredAt: string; characters: number }) | null;
    today: UsageSummary;
    month: UsageSummary;
  };
  storagePolicy: {
    local: string[];
    external: string;
    access: string;
    retention: string;
  };
};

type ErrorBody = { ok: false; error?: { message?: string; fields?: Record<string, string[]> } };

const EMPTY_USAGE: UsageSummary = {
  translations: 0,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostUsd: 0,
  byProvider: [],
};

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function providerLabel(provider: string): string {
  return provider === "openai" ? "OpenAI" : "Gemini";
}

function usd(value: number): string {
  const digits = value >= 1 ? 2 : 6;
  return `$${value.toFixed(digits)}`;
}

function integer(value: number): string {
  return value.toLocaleString("ko-KR");
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

async function json<T>(response: Response): Promise<T | ErrorBody | null> {
  return response.json().catch(() => null) as Promise<T | ErrorBody | null>;
}

function errorMessage(body: ErrorBody | null, fallback: string): string {
  return body?.error?.message || fallback;
}

function UsageCard({ title, summary, detail }: { title: string; summary: UsageSummary; detail: string }) {
  return (
    <article className="usage-card">
      <div className="usage-card-heading">
        <div><span>{title}</span><strong>{usd(summary.estimatedCostUsd)}</strong></div>
        <small>{detail}</small>
      </div>
      <dl className="usage-metrics">
        <div><dt>번역</dt><dd>{integer(summary.translations)}건</dd></div>
        <div><dt>호출</dt><dd>{integer(summary.calls)}회</dd></div>
        <div><dt>입력</dt><dd>{integer(summary.inputTokens)} 토큰</dd></div>
        <div><dt>출력</dt><dd>{integer(summary.outputTokens)} 토큰</dd></div>
      </dl>
      <ul className="provider-usage-list">
        {summary.byProvider.map((item) => (
          <li key={item.provider}>
            <span>{providerLabel(item.provider)} · {item.calls}회</span>
            <b>{usd(item.estimatedCostUsd)}</b>
          </li>
        ))}
        {summary.byProvider.length === 0 && <li><span>아직 사용 기록이 없습니다.</span></li>}
      </ul>
    </article>
  );
}

export function OperationsWorkspace() {
  const [operations, setOperations] = useState<Operations | null>(null);
  const [modelIds, setModelIds] = useState<Record<string, string>>({});
  const [monthlyLimit, setMonthlyLimit] = useState("10");
  const [dateFrom, setDateFrom] = useState(todayInSeoul);
  const [dateTo, setDateTo] = useState(todayInSeoul);
  const [deletionPreview, setDeletionPreview] = useState<{ dateFrom: string; dateTo: string; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingModels, setSavingModels] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  async function loadOperations(showLoading = true) {
    const sequence = ++loadSequence.current;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      const body = await json<{ ok: true; operations: Operations }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "운영 정보를 불러오지 못했습니다."));
      }
      if (sequence === loadSequence.current) {
        setOperations(body.operations);
        setModelIds(Object.fromEntries(body.operations.configurations.map((item) => [item.key, item.modelId])));
        setMonthlyLimit(String(body.operations.costPolicy.monthlyLimitUsd));
        setError("");
      }
    } catch (loadError) {
      if (sequence === loadSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "운영 정보를 불러오지 못했습니다.");
      }
    } finally {
      if (showLoading && sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    const sequence = ++loadSequence.current;
    void fetch("/api/operations", { cache: "no-store" })
      .then(async (response) => {
        const body = await json<{ ok: true; operations: Operations }>(response);
        if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
          throw new Error(errorMessage(body as ErrorBody | null, "운영 정보를 불러오지 못했습니다."));
        }
        return body.operations;
      })
      .then((loadedOperations) => {
        if (ignore || sequence !== loadSequence.current) return;
        setOperations(loadedOperations);
        setModelIds(Object.fromEntries(loadedOperations.configurations.map((item) => [item.key, item.modelId])));
        setMonthlyLimit(String(loadedOperations.costPolicy.monthlyLimitUsd));
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!ignore && sequence === loadSequence.current) {
          setError(loadError instanceof Error ? loadError.message : "운영 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore && sequence === loadSequence.current) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function saveModels(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operations) return;
    setSavingModels(true);
    setNotice("");
    try {
      const response = await fetch("/api/operations/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configurations: operations.configurations.map((item) => ({
            provider: item.provider,
            stage: item.stage,
            modelId: modelIds[item.key] ?? "",
          })),
        }),
      });
      const body = await json<{ ok: true }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "모델 설정을 저장하지 못했습니다."));
      }
      await loadOperations(false);
      setNotice("변경한 모델 설정을 새 버전으로 저장했습니다.");
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : "모델 설정을 저장하지 못했습니다.");
    } finally {
      setSavingModels(false);
    }
  }

  async function saveLimit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(monthlyLimit);
    if (!Number.isFinite(value) || value < 0.01) {
      setNotice("월 비용 한도는 $0.01 이상의 숫자로 입력해 주세요.");
      return;
    }
    setSavingLimit(true);
    setNotice("");
    try {
      const response = await fetch("/api/operations/cost-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyLimitUsd: value }),
      });
      const body = await json<{ ok: true }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "비용 한도를 저장하지 못했습니다."));
      }
      await loadOperations(false);
      setNotice("월 예상 비용 한도를 저장했습니다.");
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : "비용 한도를 저장하지 못했습니다.");
    } finally {
      setSavingLimit(false);
    }
  }

  async function previewDeletion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeletionPreview(null);
    setNotice("");
    const parameters = new URLSearchParams({ dateFrom, dateTo });
    try {
      const response = await fetch(`/api/operations/deletion?${parameters}`, { cache: "no-store" });
      const body = await json<{ ok: true; preview: { dateFrom: string; dateTo: string; count: number } }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "삭제 대상을 확인하지 못했습니다."));
      }
      setDeletionPreview(body.preview);
    } catch (previewError) {
      setNotice(previewError instanceof Error ? previewError.message : "삭제 대상을 확인하지 못했습니다.");
    }
  }

  async function confirmDeletion() {
    if (!deletionPreview || deletionPreview.count === 0) return;
    const confirmed = window.confirm(
      `${deletionPreview.dateFrom}부터 ${deletionPreview.dateTo}까지 번역 ${deletionPreview.count}건의 ` +
        "원문·중간 결과·최종본을 영구 삭제할까요? 이 작업은 복구할 수 없습니다.",
    );
    if (!confirmed) return;
    setDeleting(true);
    setNotice("");
    try {
      const response = await fetch("/api/operations/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: deletionPreview.dateFrom,
          dateTo: deletionPreview.dateTo,
          confirmedCount: deletionPreview.count,
        }),
      });
      const body = await json<{ ok: true; deletion: { deletedJobCount: number } }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "번역 데이터를 삭제하지 못했습니다."));
      }
      setDeletionPreview(null);
      await loadOperations(false);
      setNotice(`번역 ${body.deletion.deletedJobCount}건의 내용을 영구 삭제했습니다. 사용량 통계는 유지됩니다.`);
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : "번역 데이터를 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <section className="operations-loading" role="status">AI·비용 운영 정보를 불러오는 중입니다.</section>;
  if (error || !operations) {
    return (
      <section className="operations-loading operations-error" role="alert">
        <p>{error || "운영 정보를 불러오지 못했습니다."}</p>
        <button className="secondary-button" type="button" onClick={() => void loadOperations()}>다시 불러오기</button>
      </section>
    );
  }

  const ratio = operations.costPolicy.monthlyLimitUsd > 0
    ? operations.usage.month.estimatedCostUsd / operations.costPolicy.monthlyLimitUsd
    : 0;
  const costState = ratio >= 1 ? "limit" : ratio >= 0.8 ? "warning" : "normal";

  return (
    <section className="operations-workspace" aria-labelledby="operations-heading">
      <div className="operations-heading">
        <div>
          <p className="section-kicker">AI · COST · STORAGE</p>
          <h3 id="operations-heading">AI와 데이터 운영</h3>
          <p>현재 연결, 모델 버전, 예상 비용과 저장 데이터를 한곳에서 관리합니다.</p>
        </div>
        <span className="mode-badge" data-mode={operations.dataMode}>
          {operations.dataMode === "demo" ? "DEMO · 가짜 데이터" : "REAL · 실제 API"}
        </span>
      </div>

      {notice && <p className="operations-notice" role="status">{notice}</p>}

      <div className="provider-status-grid" aria-label="AI 연결 상태">
        {operations.providers.map((provider) => (
          <article className="provider-status-card" data-connected={provider.connected} key={provider.provider}>
            <span className="provider-mark">{provider.provider === "openai" ? "OA" : "G"}</span>
            <div>
              <small>{providerLabel(provider.provider)}</small>
              <strong>{provider.connected ? "연결됨" : "설정 오류"}</strong>
              <p>{provider.message}</p>
            </div>
            <span className="connection-dot" aria-hidden="true" />
          </article>
        ))}
      </div>

      <section className="operations-panel" aria-labelledby="usage-heading">
        <div className="operations-panel-heading">
          <div><p className="section-kicker">USAGE</p><h4 id="usage-heading">사용량과 예상 비용</h4></div>
          <span>대한민국 표준시(KST) 기준</span>
        </div>
        <div className="usage-card-grid">
          {operations.usage.last ? (
            <UsageCard
              title="최근 번역 한 건"
              summary={operations.usage.last}
              detail={`${integer(operations.usage.last.characters)}자 처리 · ${shortDate(operations.usage.last.occurredAt)}`}
            />
          ) : (
            <UsageCard title="최근 번역 한 건" summary={EMPTY_USAGE} detail="아직 번역이 없습니다." />
          )}
          <UsageCard title="오늘" summary={operations.usage.today} detail="오늘 00:00부터" />
          <UsageCard title="이번 달" summary={operations.usage.month} detail="이번 달 1일부터" />
        </div>
      </section>

      <section className="operations-panel cost-limit-panel" data-state={costState} aria-labelledby="cost-limit-heading">
        <div className="operations-panel-heading">
          <div><p className="section-kicker">MONTHLY GUARD</p><h4 id="cost-limit-heading">월 예상 비용 한도</h4></div>
          <strong>{usd(operations.usage.month.estimatedCostUsd)} / {usd(operations.costPolicy.monthlyLimitUsd)}</strong>
        </div>
        <div className="cost-progress" aria-label={`월 비용 한도 사용률 ${Math.min(100, ratio * 100).toFixed(1)}%`}>
          <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        <p className="cost-state-copy">
          {costState === "limit"
            ? "한도에 도달했습니다. 번역할 때마다 계속할지 확인합니다."
            : costState === "warning"
              ? "80% 경고 기준에 도달했습니다. 이번 달 사용량을 확인해 주세요."
              : `${usd(operations.costPolicy.warningAtUsd)}(80%)부터 경고하고 한도부터 매번 확인합니다.`}
        </p>
        <form className="cost-limit-form" onSubmit={saveLimit}>
          <label><span>월 한도 (USD)</span><input type="number" min="0.01" max="100000" step="0.01" value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} /></label>
          <button className="secondary-button" type="submit" disabled={savingLimit}>{savingLimit ? "저장 중…" : "한도 저장"}</button>
        </form>
      </section>

      <section className="operations-panel" aria-labelledby="models-heading">
        <div className="operations-panel-heading">
          <div><p className="section-kicker">MODEL &amp; PROMPT</p><h4 id="models-heading">단계별 모델과 지시문 버전</h4></div>
          <span>변경 시 이전 모델 설정은 이력으로 보관됩니다.</span>
        </div>
        <form onSubmit={saveModels}>
          <div className="model-config-list">
            {operations.configurations.map((item) => (
              <label key={item.key}>
                <span><b>{item.label}</b><small>지시문 {item.promptVersion}</small></span>
                <input aria-label={`${item.label} 모델 ID`} value={modelIds[item.key] ?? ""} onChange={(event) => setModelIds((current) => ({ ...current, [item.key]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div className="operations-form-footer">
            <span>현재 기본 배치: Luna 3단계 · Flash 2단계</span>
            <button className="primary-button" type="submit" disabled={savingModels}>{savingModels ? "저장 중…" : "모델 설정 저장"}</button>
          </div>
        </form>
      </section>

      <section className="operations-panel" aria-labelledby="prices-heading">
        <div className="operations-panel-heading">
          <div><p className="section-kicker">OFFICIAL PRICING</p><h4 id="prices-heading">적용일별 모델 단가</h4></div>
          <span>USD / 1백만 토큰</span>
        </div>
        <div className="price-table-scroll">
          <table className="price-table">
            <thead><tr><th>공급자·모델</th><th>입력</th><th>출력</th><th>적용 기간</th></tr></thead>
            <tbody>
              {operations.prices.map((price) => (
                <tr key={price.id}>
                  <td><strong>{providerLabel(price.provider)}</strong><small>{price.modelId}</small></td>
                  <td>${price.inputPricePerMillion.toFixed(2)}</td>
                  <td>${price.outputPricePerMillion.toFixed(2)}</td>
                  <td>{shortDate(price.effectiveFrom)} ~ {price.effectiveTo ? shortDate(price.effectiveTo) : "현재"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="price-sources">
          공식 출처: <a href="https://developers.openai.com/api/docs/models/gpt-5.6-luna" target="_blank" rel="noreferrer">OpenAI</a>
          <span>·</span>
          <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Gemini</a>
        </p>
      </section>

      <div className="policy-delete-grid">
        <section className="operations-panel storage-policy-panel" aria-labelledby="storage-heading">
          <div className="operations-panel-heading"><div><p className="section-kicker">DATA POLICY</p><h4 id="storage-heading">저장·외부 전송 정책</h4></div></div>
          <dl className="storage-policy-list">
            <div><dt>로컬 암호화 저장</dt><dd>{operations.storagePolicy.local.join(" · ")}</dd></div>
            <div><dt>외부 AI 전송</dt><dd>{operations.storagePolicy.external}</dd></div>
            <div><dt>접근 범위</dt><dd>{operations.storagePolicy.access}</dd></div>
            <div><dt>보관 기간</dt><dd>{operations.storagePolicy.retention}</dd></div>
          </dl>
          <p className="policy-warning">외부 AI 회사의 안전 점검 보관 정책은 이 로컬 삭제 기능과 별개입니다. 실제 모드 전환 전 Gemini 유료 상태와 회사의 외부 전송 허용을 확인하세요.</p>
        </section>

        <section className="operations-panel deletion-panel" aria-labelledby="deletion-heading">
          <div className="operations-panel-heading"><div><p className="section-kicker">PERMANENT DELETE</p><h4 id="deletion-heading">기간별 번역 데이터 삭제</h4></div></div>
          <p>선택한 기간의 원문·모델별 결과·교차검토·최종본을 함께 삭제합니다. 원문 없는 사용량과 삭제 기록은 남습니다.</p>
          <form className="deletion-form" onSubmit={previewDeletion}>
            <label><span>시작일</span><input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setDeletionPreview(null); }} /></label>
            <label><span>종료일</span><input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setDeletionPreview(null); }} /></label>
            <button className="secondary-button" type="submit">삭제 대상 확인</button>
          </form>
          {deletionPreview && (
            <div className="deletion-preview" role="status">
              <p><strong>{deletionPreview.count}건</strong>의 번역 내용이 삭제 대상입니다.</p>
              <button className="danger-button" type="button" disabled={deleting || deletionPreview.count === 0} onClick={() => void confirmDeletion()}>
                {deleting ? "삭제 중…" : "영구 삭제"}
              </button>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
