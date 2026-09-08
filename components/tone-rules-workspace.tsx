"use client";

import { useEffect, useMemo, useState } from "react";
import { toneRuleFormInputSchema, type ToneRuleFormInput } from "@/lib/validation";
import { appendPhraseText, normalizePhrases } from "@/modules/tone/phrases";

type ToneRule = ToneRuleFormInput & {
  id: string;
  usedCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ToneHistory = {
  id: string;
  action: "created" | "updated" | "deactivated" | "reactivated" | "deleted";
  changedFields: string[];
  before?: ToneRuleFormInput;
  after?: ToneRuleFormInput;
  version: number;
  createdAt: string;
};

type ErrorBody = {
  ok: false;
  error?: { message?: string; fields?: Record<string, string[]> };
};

type StatusFilter = "all" | "active" | "inactive";
type PhraseField = "cushionPhrases" | "forbiddenPhrases";

const EMPTY_FORM: ToneRuleFormInput = {
  situation: "",
  recommendedTone: "",
  cushionPhrases: [],
  forbiddenPhrases: [],
  example: undefined,
  isActive: true,
};

const STANDARD_SITUATIONS = ["인사", "요청", "거절", "사과", "독촉", "확인", "감사"];

const ACTION_LABELS: Record<ToneHistory["action"], string> = {
  created: "새 규칙 등록",
  updated: "말투 규칙 수정",
  deactivated: "사용 중지",
  reactivated: "다시 사용",
  deleted: "규칙 삭제",
};

const HISTORY_FIELDS: Array<{ key: keyof ToneRuleFormInput; label: string }> = [
  { key: "situation", label: "상황" },
  { key: "recommendedTone", label: "권장 어조" },
  { key: "cushionPhrases", label: "쿠션어" },
  { key: "forbiddenPhrases", label: "금지 표현" },
  { key: "example", label: "예문" },
  { key: "isActive", label: "사용 상태" },
];

async function responseJson<T>(response: Response): Promise<T | ErrorBody | null> {
  return response.json().catch(() => null) as Promise<T | ErrorBody | null>;
}

function errorMessage(body: ErrorBody | null, fallback: string): string {
  return body?.error?.message || fallback;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function historyValue(snapshot: ToneRuleFormInput | undefined, field: keyof ToneRuleFormInput): string {
  if (!snapshot) return "—";
  const value = snapshot[field];
  if (Array.isArray(value)) return value.length ? value.join(", ") : "없음";
  if (typeof value === "boolean") return value ? "사용 중" : "사용 중지";
  return value || "없음";
}

export function ToneRulesWorkspace() {
  const [rules, setRules] = useState<ToneRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<ToneRule | "new" | null>(null);
  const [form, setForm] = useState<ToneRuleFormInput>(EMPTY_FORM);
  const [cushionDraft, setCushionDraft] = useState("");
  const [forbiddenDraft, setForbiddenDraft] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyRule, setHistoryRule] = useState<ToneRule | null>(null);
  const [history, setHistory] = useState<ToneHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    void fetch("/api/tone-rules", { cache: "no-store" })
      .then(async (response) => {
        const body = await responseJson<{ ok: true; rules: ToneRule[] }>(response);
        if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
          throw new Error(errorMessage(body as ErrorBody | null, "말투 규칙을 불러오지 못했습니다."));
        }
        return body.rules;
      })
      .then((loadedRules) => {
        if (!ignore) {
          setRules(loadedRules);
          setPageError("");
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setPageError(error instanceof Error ? error.message : "말투 규칙을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase("und");
    return rules.filter((rule) => {
      const matchesQuery = !normalizedQuery || [
        rule.situation,
        rule.recommendedTone,
        rule.example ?? "",
        ...rule.cushionPhrases,
        ...rule.forbiddenPhrases,
      ].some((value) => value.normalize("NFKC").toLocaleLowerCase("und").includes(normalizedQuery));
      const matchesStatus = status === "all" ||
        (status === "active" ? rule.isActive : !rule.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [query, rules, status]);

  async function reloadRules() {
    setLoading(true);
    try {
      const response = await fetch("/api/tone-rules", { cache: "no-store" });
      const body = await responseJson<{ ok: true; rules: ToneRule[] }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "말투 규칙을 불러오지 못했습니다."));
      }
      setRules(body.rules);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "말투 규칙을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function resetDrafts() {
    setCushionDraft("");
    setForbiddenDraft("");
  }

  function openCreate() {
    setEditing("new");
    setForm({ ...EMPTY_FORM, cushionPhrases: [], forbiddenPhrases: [] });
    resetDrafts();
    setFieldErrors({});
  }

  function openEdit(rule: ToneRule) {
    setEditing(rule);
    setForm({
      situation: rule.situation,
      recommendedTone: rule.recommendedTone,
      cushionPhrases: [...rule.cushionPhrases],
      forbiddenPhrases: [...rule.forbiddenPhrases],
      example: rule.example,
      isActive: rule.isActive,
    });
    resetDrafts();
    setFieldErrors({});
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setFieldErrors({});
    resetDrafts();
  }

  function addPhrases(field: PhraseField, text: string) {
    const next = appendPhraseText(form[field], text);
    if (next.length > 30) {
      setFieldErrors((current) => ({ ...current, [field]: "표현은 최대 30개까지 입력할 수 있습니다." }));
      return;
    }
    setForm((current) => ({ ...current, [field]: next }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  function commitDraft(field: PhraseField) {
    const draft = field === "cushionPhrases" ? cushionDraft : forbiddenDraft;
    if (!draft.trim()) return;
    addPhrases(field, draft);
    if (field === "cushionPhrases") setCushionDraft("");
    else setForbiddenDraft("");
  }

  function changeDraft(field: PhraseField, value: string) {
    const setter = field === "cushionPhrases" ? setCushionDraft : setForbiddenDraft;
    if (!value.includes(",")) {
      setter(value);
      return;
    }
    const segments = value.split(",");
    addPhrases(field, segments.slice(0, -1).join(","));
    setter(segments.at(-1) ?? "");
  }

  function removePhrase(field: PhraseField, phrase: string) {
    setForm((current) => ({
      ...current,
      [field]: current[field].filter((item) => item !== phrase),
    }));
  }

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = {
      ...form,
      cushionPhrases: normalizePhrases([...form.cushionPhrases, cushionDraft]),
      forbiddenPhrases: normalizePhrases([...form.forbiddenPhrases, forbiddenDraft]),
      example: form.example?.trim() || undefined,
    };
    const parsed = toneRuleFormInputSchema.safeParse(value);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const isNew = editing === "new";
      const response = await fetch(isNew ? "/api/tone-rules" : `/api/tone-rules/${editing?.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? parsed.data : { operation: "update", rule: parsed.data }),
      });
      const body = await responseJson<{ ok: true; rule: ToneRule }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        const failure = body as ErrorBody | null;
        setFieldErrors(
          failure?.error?.fields
            ? Object.fromEntries(
                Object.entries(failure.error.fields).map(([field, messages]) => [field, messages[0]]),
              )
            : { form: errorMessage(failure, "말투 규칙을 저장하지 못했습니다.") },
        );
        return;
      }

      setRules((current) => isNew
        ? [...current, body.rule]
        : current.map((rule) => rule.id === body.rule.id ? body.rule : rule));
      setEditing(null);
      resetDrafts();
      setNotice(isNew ? "새 말투 규칙을 등록했습니다." : "말투 규칙 변경 내용을 저장했습니다.");
    } catch {
      setFieldErrors({ form: "말투 규칙을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setSaving(false);
    }
  }

  async function setActive(rule: ToneRule) {
    setBusyId(rule.id);
    setNotice("");
    try {
      const response = await fetch(`/api/tone-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "setActive", isActive: !rule.isActive }),
      });
      const body = await responseJson<{ ok: true; rule: ToneRule }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "사용 상태를 바꾸지 못했습니다."));
      }
      setRules((current) => current.map((item) => item.id === body.rule.id ? body.rule : item));
      setNotice(body.rule.isActive ? "말투 규칙을 다시 사용합니다." : "말투 규칙 사용을 중지했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "사용 상태를 바꾸지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(rule: ToneRule) {
    if (rule.usedCount > 0 || !window.confirm(`‘${rule.situation}’ 말투 규칙을 완전히 삭제할까요?`)) return;
    setBusyId(rule.id);
    setNotice("");
    try {
      const response = await fetch(`/api/tone-rules/${rule.id}`, { method: "DELETE" });
      const body = await responseJson<{ ok: true }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "말투 규칙을 삭제하지 못했습니다."));
      }
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setNotice("사용 이력이 없는 말투 규칙을 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "말투 규칙을 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function openHistory(rule: ToneRule) {
    setHistoryRule(rule);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/tone-rules/${rule.id}/history`, { cache: "no-store" });
      const body = await responseJson<{ ok: true; history: ToneHistory[] }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "변경 기록을 불러오지 못했습니다."));
      }
      setHistory(body.history);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "변경 기록을 불러오지 못했습니다.");
      setHistoryRule(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  function phraseEditor(field: PhraseField, label: string, placeholder: string) {
    const draft = field === "cushionPhrases" ? cushionDraft : forbiddenDraft;
    return (
      <label className="tone-phrase-field">
        <span>{label}</span>
        <div className="alias-input-box" data-invalid={Boolean(fieldErrors[field])}>
          {form[field].map((phrase) => (
            <span className="alias-tag" key={phrase}>
              {phrase}
              <button type="button" onClick={() => removePhrase(field, phrase)} aria-label={`${phrase} 삭제`}>×</button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(event) => changeDraft(field, event.target.value)}
            onBlur={() => commitDraft(field)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitDraft(field);
              }
            }}
            placeholder={placeholder}
            aria-label={`${label} 입력`}
          />
        </div>
        {fieldErrors[field] && <small role="alert">{fieldErrors[field]}</small>}
      </label>
    );
  }

  return (
    <section className="tone-workspace" aria-labelledby="tone-rules-heading">
      <div className="tone-toolbar">
        <div>
          <p className="section-kicker">TONE RULES</p>
          <h3 id="tone-rules-heading">상황별 말투 규칙</h3>
          <p>활성 규칙은 감지된 상황에 맞춰 모든 AI 번역 단계에 동일하게 적용됩니다.</p>
        </div>
        <div className="tone-toolbar-actions">
          <label className="search-field">
            <span className="sr-only">말투 규칙 검색</span>
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상황·어조·표현 검색" />
          </label>
          <label>
            <span className="sr-only">말투 규칙 사용 상태</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="all">모든 상태</option>
              <option value="active">사용 중</option>
              <option value="inactive">사용 중지</option>
            </select>
          </label>
          <button className="primary-button" type="button" onClick={openCreate}>+ 새 말투</button>
        </div>
      </div>

      {notice && <p className="glossary-notice" role="status">{notice}</p>}
      {loading ? (
        <div className="tone-empty" role="status">말투 규칙을 불러오는 중입니다.</div>
      ) : pageError ? (
        <div className="tone-empty tone-load-error" role="alert">
          <p>{pageError}</p>
          <button className="secondary-button" type="button" onClick={() => void reloadRules()}>다시 불러오기</button>
        </div>
      ) : (
        <>
          <div className="tone-summary"><span>표시 중 {filteredRules.length}개</span><b>전체 {rules.length}개</b></div>
          <div className="tone-card-grid">
            {filteredRules.map((rule) => (
              <article className="tone-card" data-active={rule.isActive} data-testid="tone-card" key={rule.id}>
                <div className="tone-card-header">
                  <span className="tone-situation">{rule.situation}</span>
                  <span className="status-badge" data-active={rule.isActive}>
                    <span />{rule.isActive ? "사용 중" : "사용 중지"}
                  </span>
                </div>
                <div className="tone-recommendation">
                  <span>권장 어조</span>
                  <strong>{rule.recommendedTone}</strong>
                </div>
                <dl className="tone-details">
                  <div>
                    <dt>쿠션어</dt>
                    <dd>{rule.cushionPhrases.length ? rule.cushionPhrases.join(" · ") : "없음"}</dd>
                  </div>
                  <div>
                    <dt>금지 표현</dt>
                    <dd>{rule.forbiddenPhrases.length ? rule.forbiddenPhrases.join(" · ") : "없음"}</dd>
                  </div>
                  <div>
                    <dt>예문</dt>
                    <dd>{rule.example || "등록된 예문이 없습니다."}</dd>
                  </div>
                </dl>
                <div className="tone-card-footer">
                  <small>v{rule.version} · 번역 {rule.usedCount.toLocaleString("ko-KR")}회 · {dateLabel(rule.updatedAt)}</small>
                  <div className="row-actions">
                    <button type="button" onClick={() => openEdit(rule)}>수정</button>
                    <button type="button" onClick={() => void openHistory(rule)}>기록</button>
                    <button type="button" disabled={busyId === rule.id} onClick={() => void setActive(rule)}>
                      {rule.isActive ? "사용 중지" : "다시 사용"}
                    </button>
                    {rule.usedCount === 0 && (
                      <button className="danger-action" type="button" disabled={busyId === rule.id} onClick={() => void deleteRule(rule)}>삭제</button>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {filteredRules.length === 0 && <div className="tone-empty">조건에 맞는 말투 규칙이 없습니다.</div>}
          </div>
        </>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section className="glossary-modal tone-modal" role="dialog" aria-modal="true" aria-labelledby="tone-modal-title">
            <div className="modal-header">
              <div>
                <p className="section-kicker">{editing === "new" ? "NEW TONE RULE" : "EDIT TONE RULE"}</p>
                <h3 id="tone-modal-title">{editing === "new" ? "새 말투 규칙" : "말투 규칙 수정"}</h3>
              </div>
              <button type="button" onClick={closeEditor} aria-label="말투 규칙 창 닫기">×</button>
            </div>
            <form className="tone-form" onSubmit={saveRule} noValidate>
              <div className="form-grid">
                <label>
                  <span>상황 <b>*</b></span>
                  <input
                    autoFocus
                    list="standard-tone-situations"
                    value={form.situation}
                    onChange={(event) => setForm((current) => ({ ...current, situation: event.target.value }))}
                    placeholder="예: 요청"
                    aria-invalid={Boolean(fieldErrors.situation)}
                  />
                  <datalist id="standard-tone-situations">
                    {STANDARD_SITUATIONS.map((situation) => <option value={situation} key={situation} />)}
                  </datalist>
                  {fieldErrors.situation && <small role="alert">{fieldErrors.situation}</small>}
                </label>
                <label className="active-checkbox">
                  <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  <span>저장 후 번역에 바로 적용</span>
                </label>
              </div>
              <label>
                <span>권장 어조 <b>*</b></span>
                <textarea
                  rows={3}
                  value={form.recommendedTone}
                  onChange={(event) => setForm((current) => ({ ...current, recommendedTone: event.target.value }))}
                  placeholder="이 상황에서 지켜야 할 어조를 입력하세요."
                  aria-invalid={Boolean(fieldErrors.recommendedTone)}
                />
                {fieldErrors.recommendedTone && <small role="alert">{fieldErrors.recommendedTone}</small>}
              </label>
              <div className="form-grid tone-phrase-grid">
                {phraseEditor("cushionPhrases", "쿠션어", "Enter 또는 쉼표로 추가")}
                {phraseEditor("forbiddenPhrases", "금지 표현", "Enter 또는 쉼표로 추가")}
              </div>
              <label>
                <span>예문</span>
                <textarea
                  rows={4}
                  value={form.example ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, example: event.target.value }))}
                  placeholder="권장 말투가 적용된 예문을 입력하세요."
                  aria-invalid={Boolean(fieldErrors.example)}
                />
                {fieldErrors.example && <small role="alert">{fieldErrors.example}</small>}
              </label>
              {fieldErrors.form && <p className="form-error" role="alert">{fieldErrors.form}</p>}
              <div className="modal-footer">
                <button className="secondary-button" type="button" onClick={closeEditor} disabled={saving}>취소</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {historyRule && (
        <div className="modal-backdrop" role="presentation">
          <section className="glossary-modal history-modal" role="dialog" aria-modal="true" aria-labelledby="tone-history-title">
            <div className="modal-header">
              <div>
                <p className="section-kicker">CHANGE HISTORY</p>
                <h3 id="tone-history-title">{historyRule.situation} 말투 변경 기록</h3>
              </div>
              <button type="button" onClick={() => setHistoryRule(null)} aria-label="말투 변경 기록 닫기">×</button>
            </div>
            {historyLoading ? (
              <p className="history-empty">변경 기록을 불러오는 중입니다.</p>
            ) : history.length === 0 ? (
              <p className="history-empty">이 규칙을 수정한 기록이 없습니다.</p>
            ) : (
              <ol className="history-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <span className="history-dot" />
                    <div>
                      <strong>{ACTION_LABELS[entry.action]} · v{entry.version}</strong>
                      <p>변경 항목: {entry.changedFields.join(" · ")}</p>
                      <dl className="history-changes">
                        {HISTORY_FIELDS.filter((field) => entry.changedFields.includes(field.label)).map((field) => (
                          <div key={field.key}>
                            <dt>{field.label}</dt>
                            <dd>
                              <span>{historyValue(entry.before, field.key)}</span>
                              <i aria-hidden="true">→</i>
                              <strong>{historyValue(entry.after, field.key)}</strong>
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <time dateTime={entry.createdAt}>{dateLabel(entry.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
