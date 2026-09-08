"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { glossaryFormInputSchema, type GlossaryFormInput } from "@/lib/validation";

type GlossaryTerm = GlossaryFormInput & {
  id: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
};

type GlossaryHistory = {
  id: string;
  action: "created" | "imported" | "updated" | "deactivated" | "reactivated" | "deleted";
  changedFields: string[];
  createdAt: string;
};

type ErrorBody = {
  ok: false;
  error?: { message?: string; fields?: Record<string, string[]> };
};

type ImportResult = {
  importedCount: number;
  errors: Array<{ rowNumber: number; reason: string }>;
};

type DirectionFilter = "all" | GlossaryFormInput["direction"];
type StatusFilter = "all" | "active" | "inactive";

const EMPTY_FORM: GlossaryFormInput = {
  sourceText: "",
  targetText: "",
  direction: "ko-ja",
  description: undefined,
  forbiddenTerms: [],
  isActive: true,
};

const ACTION_LABELS: Record<GlossaryHistory["action"], string> = {
  created: "새 용어 등록",
  imported: "파일로 가져오기",
  updated: "용어 수정",
  deactivated: "사용 중지",
  reactivated: "다시 사용",
  deleted: "용어 삭제",
};

function directionLabel(direction: GlossaryFormInput["direction"]): string {
  return direction === "ko-ja" ? "한국어 → 일본어" : "일본어 → 한국어";
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

async function responseJson<T>(response: Response): Promise<T | ErrorBody | null> {
  return response.json().catch(() => null) as Promise<T | ErrorBody | null>;
}

function errorMessage(body: ErrorBody | null, fallback: string): string {
  return body?.error?.message || fallback;
}

export function GlossaryWorkspace() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<GlossaryTerm | "new" | null>(null);
  const [form, setForm] = useState<GlossaryFormInput>(EMPTY_FORM);
  const [forbiddenInput, setForbiddenInput] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [historyTerm, setHistoryTerm] = useState<GlossaryTerm | null>(null);
  const [history, setHistory] = useState<GlossaryHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadTerms(showLoader = false) {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch("/api/glossary", { cache: "no-store" });
      const body = await responseJson<{ ok: true; terms: GlossaryTerm[] }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "용어 목록을 불러오지 못했습니다."));
      }
      setTerms(body.terms);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "용어 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    void fetch("/api/glossary", { cache: "no-store" })
      .then(async (response) => {
        const body = await responseJson<{ ok: true; terms: GlossaryTerm[] }>(response);
        if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
          throw new Error(errorMessage(body as ErrorBody | null, "용어 목록을 불러오지 못했습니다."));
        }
        return body.terms;
      })
      .then((loadedTerms) => {
        if (!ignore) {
          setTerms(loadedTerms);
          setPageError("");
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setPageError(error instanceof Error ? error.message : "용어 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filteredTerms = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase("und");
    return terms.filter((term) => {
      const matchesQuery = !normalizedQuery || [
        term.sourceText,
        term.targetText,
        term.description ?? "",
        ...term.forbiddenTerms,
      ].some((value) => value.normalize("NFKC").toLocaleLowerCase("und").includes(normalizedQuery));
      const matchesDirection = direction === "all" || term.direction === direction;
      const matchesStatus = status === "all" ||
        (status === "active" ? term.isActive : !term.isActive);
      return matchesQuery && matchesDirection && matchesStatus;
    });
  }, [direction, query, status, terms]);

  function openCreate() {
    setEditing("new");
    setForm({ ...EMPTY_FORM, forbiddenTerms: [] });
    setForbiddenInput("");
    setFieldErrors({});
  }

  function openEdit(term: GlossaryTerm) {
    setEditing(term);
    setForm({
      sourceText: term.sourceText,
      targetText: term.targetText,
      direction: term.direction,
      description: term.description,
      forbiddenTerms: [...term.forbiddenTerms],
      isActive: term.isActive,
    });
    setForbiddenInput(term.forbiddenTerms.join(", "));
    setFieldErrors({});
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setFieldErrors({});
  }

  async function saveTerm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = {
      ...form,
      description: form.description?.trim() || undefined,
      forbiddenTerms: [...new Set(forbiddenInput.split(",").map((term) => term.trim()).filter(Boolean))],
    };
    const parsed = glossaryFormInputSchema.safeParse(value);
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
      const response = await fetch(isNew ? "/api/glossary" : `/api/glossary/${editing?.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? parsed.data : { operation: "update", term: parsed.data }),
      });
      const body = await responseJson<{ ok: true; term: GlossaryTerm }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        const failure = body as ErrorBody | null;
        setFieldErrors(
          failure?.error?.fields
            ? Object.fromEntries(
                Object.entries(failure.error.fields).map(([field, messages]) => [field, messages[0]]),
              )
            : { form: errorMessage(failure, "용어를 저장하지 못했습니다.") },
        );
        return;
      }

      setTerms((current) => isNew
        ? [...current, body.term]
        : current.map((term) => term.id === body.term.id ? body.term : term));
      setEditing(null);
      setNotice(isNew ? "새 용어를 등록했습니다." : "용어 변경 내용을 저장했습니다.");
    } catch {
      setFieldErrors({ form: "용어를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setSaving(false);
    }
  }

  async function setActive(term: GlossaryTerm) {
    setBusyId(term.id);
    setNotice("");
    try {
      const response = await fetch(`/api/glossary/${term.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "setActive", isActive: !term.isActive }),
      });
      const body = await responseJson<{ ok: true; term: GlossaryTerm }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "사용 상태를 바꾸지 못했습니다."));
      }
      setTerms((current) => current.map((item) => item.id === body.term.id ? body.term : item));
      setNotice(body.term.isActive ? "용어를 다시 사용합니다." : "용어 사용을 중지했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "사용 상태를 바꾸지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTerm(term: GlossaryTerm) {
    if (term.usedCount > 0 || !window.confirm(`‘${term.sourceText}’ 용어를 완전히 삭제할까요?`)) return;
    setBusyId(term.id);
    setNotice("");
    try {
      const response = await fetch(`/api/glossary/${term.id}`, { method: "DELETE" });
      const body = await responseJson<{ ok: true }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "용어를 삭제하지 못했습니다."));
      }
      setTerms((current) => current.filter((item) => item.id !== term.id));
      setNotice("사용 이력이 없는 용어를 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "용어를 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setImportResult(null);
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/glossary/import", { method: "POST", body: formData });
      const body = await responseJson<{ ok: true } & ImportResult>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "파일을 가져오지 못했습니다."));
      }
      setImportResult({ importedCount: body.importedCount, errors: body.errors });
      if (body.importedCount > 0) await loadTerms();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "파일을 가져오지 못했습니다.");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function openHistory(term: GlossaryTerm) {
    setHistoryTerm(term);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/glossary/${term.id}/history`, { cache: "no-store" });
      const body = await responseJson<{ ok: true; history: GlossaryHistory[] }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "변경 기록을 불러오지 못했습니다."));
      }
      setHistory(body.history);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "변경 기록을 불러오지 못했습니다.");
      setHistoryTerm(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="glossary-workspace">
      <div className="glossary-toolbar">
        <div className="glossary-filters" aria-label="용어 검색과 필터">
          <label className="search-field">
            <span className="sr-only">용어 검색</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="원어·권장 표기·설명 검색"
            />
          </label>
          <label>
            <span className="sr-only">언어 방향</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value as DirectionFilter)}>
              <option value="all">모든 언어 방향</option>
              <option value="ko-ja">한국어 → 일본어</option>
              <option value="ja-ko">일본어 → 한국어</option>
            </select>
          </label>
          <label>
            <span className="sr-only">사용 상태</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="all">모든 상태</option>
              <option value="active">사용 중</option>
              <option value="inactive">사용 중지</option>
            </select>
          </label>
        </div>
        <div className="glossary-actions">
          <a className="secondary-button" href="/api/glossary/template" download>
            예시 파일
          </a>
          <label className="secondary-button file-button" aria-disabled={importing}>
            {importing ? "가져오는 중…" : "파일 가져오기"}
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
          </label>
          <button className="primary-button" type="button" onClick={openCreate}>+ 새 용어</button>
        </div>
      </div>

      {notice && <p className="glossary-notice" role="status">{notice}</p>}
      {importResult && (
        <section className="import-report" aria-label="파일 가져오기 결과">
          <strong>{importResult.importedCount}개 용어를 추가했습니다.</strong>
          {importResult.errors.length > 0 && (
            <>
              <span>{importResult.errors.length}개 행은 추가하지 못했습니다.</span>
              <ul>
                {importResult.errors.map((error) => (
                  <li key={`${error.rowNumber}-${error.reason}`}>
                    <b>{error.rowNumber}행</b> {error.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => setImportResult(null)} aria-label="가져오기 결과 닫기">×</button>
        </section>
      )}

      <section className="glossary-table-card" aria-labelledby="glossary-list-heading">
        <div className="glossary-list-header">
          <div>
            <p className="section-kicker">TERMS</p>
            <h3 id="glossary-list-heading">등록 용어</h3>
          </div>
          <span>{filteredTerms.length} / {terms.length}개</span>
        </div>

        {loading ? (
          <div className="glossary-empty" role="status">용어 목록을 불러오는 중입니다.</div>
        ) : pageError ? (
          <div className="glossary-empty glossary-load-error" role="alert">
            <p>{pageError}</p>
            <button className="secondary-button" type="button" onClick={() => void loadTerms(true)}>다시 불러오기</button>
          </div>
        ) : filteredTerms.length === 0 ? (
          <div className="glossary-empty">조건에 맞는 용어가 없습니다.</div>
        ) : (
          <div className="glossary-table-scroll">
            <table className="glossary-table">
              <thead>
                <tr>
                  <th>원어</th>
                  <th>권장 표기</th>
                  <th>언어 방향</th>
                  <th>설명·금지 표기</th>
                  <th>사용 상태</th>
                  <th><span className="sr-only">관리</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredTerms.map((term) => (
                  <tr key={term.id} data-testid="glossary-row">
                    <td><strong>{term.sourceText}</strong></td>
                    <td><strong className="recommended-term">{term.targetText}</strong></td>
                    <td><span className="direction-badge">{directionLabel(term.direction)}</span></td>
                    <td>
                      <span className="term-description">{term.description || "설명 없음"}</span>
                      {term.forbiddenTerms.length > 0 && (
                        <small>금지: {term.forbiddenTerms.join(", ")}</small>
                      )}
                    </td>
                    <td>
                      <span className="status-badge" data-active={term.isActive}>
                        <span />{term.isActive ? "사용 중" : "사용 중지"}
                      </span>
                      <small>번역 {term.usedCount.toLocaleString("ko-KR")}회 · {dateLabel(term.updatedAt)}</small>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => openEdit(term)}>수정</button>
                        <button type="button" onClick={() => void openHistory(term)}>기록</button>
                        <button
                          type="button"
                          disabled={busyId === term.id}
                          onClick={() => void setActive(term)}
                        >
                          {term.isActive ? "사용 중지" : "다시 사용"}
                        </button>
                        {term.usedCount === 0 && (
                          <button
                            className="danger-action"
                            type="button"
                            disabled={busyId === term.id}
                            onClick={() => void deleteTerm(term)}
                          >삭제</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section className="glossary-modal" role="dialog" aria-modal="true" aria-labelledby="term-modal-title">
            <div className="modal-header">
              <div>
                <p className="section-kicker">{editing === "new" ? "NEW TERM" : "EDIT TERM"}</p>
                <h3 id="term-modal-title">{editing === "new" ? "새 용어 등록" : "용어 수정"}</h3>
              </div>
              <button type="button" onClick={closeEditor} aria-label="용어 창 닫기">×</button>
            </div>
            <form className="term-form" onSubmit={saveTerm} noValidate>
              <div className="form-grid">
                <label>
                  <span>원어 <b>*</b></span>
                  <input
                    autoFocus
                    value={form.sourceText}
                    onChange={(event) => setForm((current) => ({ ...current, sourceText: event.target.value }))}
                    aria-invalid={Boolean(fieldErrors.sourceText)}
                  />
                  {fieldErrors.sourceText && <small role="alert">{fieldErrors.sourceText}</small>}
                </label>
                <label>
                  <span>권장 표기 <b>*</b></span>
                  <input
                    value={form.targetText}
                    onChange={(event) => setForm((current) => ({ ...current, targetText: event.target.value }))}
                    aria-invalid={Boolean(fieldErrors.targetText)}
                  />
                  {fieldErrors.targetText && <small role="alert">{fieldErrors.targetText}</small>}
                </label>
                <label>
                  <span>언어 방향 <b>*</b></span>
                  <select
                    value={form.direction}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      direction: event.target.value as GlossaryFormInput["direction"],
                    }))}
                  >
                    <option value="ko-ja">한국어 → 일본어</option>
                    <option value="ja-ko">일본어 → 한국어</option>
                  </select>
                </label>
                <label className="active-checkbox">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  />
                  <span>저장 후 번역에 바로 적용</span>
                </label>
              </div>
              <label>
                <span>설명</span>
                <textarea
                  rows={3}
                  value={form.description ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  aria-invalid={Boolean(fieldErrors.description)}
                />
                {fieldErrors.description && <small role="alert">{fieldErrors.description}</small>}
              </label>
              <label>
                <span>사용하지 않을 표기</span>
                <input
                  value={forbiddenInput}
                  onChange={(event) => setForbiddenInput(event.target.value)}
                  placeholder="쉼표로 구분해 입력하세요"
                  aria-invalid={Boolean(fieldErrors.forbiddenTerms)}
                />
                <em>예: 온토스, オントス</em>
                {fieldErrors.forbiddenTerms && <small role="alert">{fieldErrors.forbiddenTerms}</small>}
              </label>
              {fieldErrors.form && <p className="form-error" role="alert">{fieldErrors.form}</p>}
              <div className="modal-footer">
                <button className="secondary-button" type="button" onClick={closeEditor} disabled={saving}>취소</button>
                <button className="primary-button" type="submit" disabled={saving}>
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {historyTerm && (
        <div className="modal-backdrop" role="presentation">
          <section className="glossary-modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
            <div className="modal-header">
              <div>
                <p className="section-kicker">CHANGE HISTORY</p>
                <h3 id="history-modal-title">{historyTerm.sourceText} 변경 기록</h3>
              </div>
              <button type="button" onClick={() => setHistoryTerm(null)} aria-label="변경 기록 닫기">×</button>
            </div>
            {historyLoading ? (
              <p className="history-empty">변경 기록을 불러오는 중입니다.</p>
            ) : history.length === 0 ? (
              <p className="history-empty">남겨진 변경 기록이 없습니다.</p>
            ) : (
              <ol className="history-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <span className="history-dot" />
                    <div>
                      <strong>{ACTION_LABELS[entry.action]}</strong>
                      <p>{entry.changedFields.join(" · ")}</p>
                      <time dateTime={entry.createdAt}>{dateLabel(entry.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
