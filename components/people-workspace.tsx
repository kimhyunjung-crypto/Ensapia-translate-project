"use client";

import { useEffect, useMemo, useState } from "react";
import { personFormInputSchema, type PersonFormInput } from "@/lib/validation";
import { appendAliasText, normalizeAliases } from "@/modules/people/aliases";

type PersonRule = PersonFormInput & {
  id: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
};

type ErrorBody = {
  ok: false;
  error?: { message?: string; fields?: Record<string, string[]> };
};

type StatusFilter = "all" | "active" | "inactive";

const EMPTY_FORM: PersonFormInput = {
  japaneseCanonical: "",
  koreanCanonical: "",
  aliases: [],
  isActive: true,
};

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
  }).format(new Date(value));
}

export function PeopleWorkspace() {
  const [people, setPeople] = useState<PersonRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<PersonRule | "new" | null>(null);
  const [form, setForm] = useState<PersonFormInput>(EMPTY_FORM);
  const [aliasDraft, setAliasDraft] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    void fetch("/api/people", { cache: "no-store" })
      .then(async (response) => {
        const body = await responseJson<{ ok: true; people: PersonRule[] }>(response);
        if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
          throw new Error(errorMessage(body as ErrorBody | null, "인명·호칭 목록을 불러오지 못했습니다."));
        }
        return body.people;
      })
      .then((loadedPeople) => {
        if (!ignore) {
          setPeople(loadedPeople);
          setPageError("");
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setPageError(error instanceof Error ? error.message : "인명·호칭 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filteredPeople = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase("und");
    return people.filter((person) => {
      const matchesQuery = !normalizedQuery || [
        person.japaneseCanonical,
        person.koreanCanonical,
        ...person.aliases,
      ].some((value) => value.normalize("NFKC").toLocaleLowerCase("und").includes(normalizedQuery));
      const matchesStatus = status === "all" ||
        (status === "active" ? person.isActive : !person.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [people, query, status]);

  const previewAliases = useMemo(
    () => normalizeAliases([...form.aliases, aliasDraft]),
    [aliasDraft, form.aliases],
  );

  async function reloadPeople() {
    try {
      const response = await fetch("/api/people", { cache: "no-store" });
      const body = await responseJson<{ ok: true; people: PersonRule[] }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "인명·호칭 목록을 불러오지 못했습니다."));
      }
      setPeople(body.people);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "인명·호칭 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing("new");
    setForm({ ...EMPTY_FORM, aliases: [] });
    setAliasDraft("");
    setFieldErrors({});
  }

  function openEdit(person: PersonRule) {
    setEditing(person);
    setForm({
      japaneseCanonical: person.japaneseCanonical,
      koreanCanonical: person.koreanCanonical,
      aliases: [...person.aliases],
      isActive: person.isActive,
    });
    setAliasDraft("");
    setFieldErrors({});
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setFieldErrors({});
  }

  function addAliases(text: string) {
    const next = appendAliasText(form.aliases, text);
    if (next.length > 30) {
      setFieldErrors((current) => ({ ...current, aliases: "인식 표현은 최대 30개까지 입력할 수 있습니다." }));
      return;
    }
    setForm((current) => ({ ...current, aliases: next }));
    setFieldErrors((current) => ({ ...current, aliases: "" }));
  }

  function commitAliasDraft() {
    if (!aliasDraft.trim()) return;
    addAliases(aliasDraft);
    setAliasDraft("");
  }

  function handleAliasChange(value: string) {
    if (!value.includes(",")) {
      setAliasDraft(value);
      return;
    }
    const segments = value.split(",");
    addAliases(segments.slice(0, -1).join(","));
    setAliasDraft(segments.at(-1) ?? "");
  }

  async function savePerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = { ...form, aliases: normalizeAliases([...form.aliases, aliasDraft]) };
    const parsed = personFormInputSchema.safeParse(value);
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
      const response = await fetch(isNew ? "/api/people" : `/api/people/${editing?.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? parsed.data : { operation: "update", person: parsed.data }),
      });
      const body = await responseJson<{ ok: true; person: PersonRule }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        const failure = body as ErrorBody | null;
        setFieldErrors(
          failure?.error?.fields
            ? Object.fromEntries(
                Object.entries(failure.error.fields).map(([field, messages]) => [field, messages[0]]),
              )
            : { form: errorMessage(failure, "인명·호칭 규칙을 저장하지 못했습니다.") },
        );
        return;
      }

      setPeople((current) => isNew
        ? [...current, body.person]
        : current.map((person) => person.id === body.person.id ? body.person : person));
      setEditing(null);
      setAliasDraft("");
      setNotice(isNew ? "새 인명·호칭 규칙을 등록했습니다." : "인명·호칭 변경 내용을 저장했습니다.");
    } catch {
      setFieldErrors({ form: "인명·호칭 규칙을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setSaving(false);
    }
  }

  async function setActive(person: PersonRule) {
    setBusyId(person.id);
    setNotice("");
    try {
      const response = await fetch(`/api/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "setActive", isActive: !person.isActive }),
      });
      const body = await responseJson<{ ok: true; person: PersonRule }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "사용 상태를 바꾸지 못했습니다."));
      }
      setPeople((current) => current.map((item) => item.id === body.person.id ? body.person : item));
      setNotice(body.person.isActive ? "인명·호칭 규칙을 다시 사용합니다." : "인명·호칭 규칙 사용을 중지했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "사용 상태를 바꾸지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePerson(person: PersonRule) {
    if (person.usedCount > 0 || !window.confirm(`‘${person.japaneseCanonical}’ 규칙을 완전히 삭제할까요?`)) return;
    setBusyId(person.id);
    setNotice("");
    try {
      const response = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
      const body = await responseJson<{ ok: true }>(response);
      if (!response.ok || !body || !("ok" in body) || body.ok !== true) {
        throw new Error(errorMessage(body as ErrorBody | null, "규칙을 삭제하지 못했습니다."));
      }
      setPeople((current) => current.filter((item) => item.id !== person.id));
      setNotice("사용 이력이 없는 인명·호칭 규칙을 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "규칙을 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="people-workspace">
      <div className="people-toolbar">
        <div className="people-filters" aria-label="인명·호칭 검색과 필터">
          <label className="search-field">
            <span className="sr-only">인명·호칭 검색</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="통합 표기·인식 표현 검색"
            />
          </label>
          <label>
            <span className="sr-only">인명 규칙 사용 상태</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="all">모든 상태</option>
              <option value="active">사용 중</option>
              <option value="inactive">사용 중지</option>
            </select>
          </label>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>+ 새 멤버</button>
      </div>

      {notice && <p className="glossary-notice" role="status">{notice}</p>}

      {loading ? (
        <div className="people-empty" role="status">인명·호칭 목록을 불러오는 중입니다.</div>
      ) : pageError ? (
        <div className="people-empty people-load-error" role="alert">
          <p>{pageError}</p>
          <button className="secondary-button" type="button" onClick={() => void reloadPeople()}>다시 불러오기</button>
        </div>
      ) : (
        <section className="people-section" aria-labelledby="people-list-heading">
          <div className="people-section-header">
            <div>
              <p className="section-kicker">PEOPLE RULES</p>
              <h3 id="people-list-heading">등록된 인명·호칭</h3>
            </div>
            <span>{filteredPeople.length} / {people.length}개</span>
          </div>

          <div className="people-card-grid">
            {filteredPeople.map((person) => (
              <article className="person-card" data-active={person.isActive} data-testid="person-card" key={person.id}>
                <div className="person-card-header">
                  <div className="person-avatar" aria-hidden="true">{person.koreanCanonical.slice(0, 1)}</div>
                  <div>
                    <strong>{person.japaneseCanonical}</strong>
                    <span>{person.koreanCanonical}</span>
                  </div>
                  <span className="status-badge" data-active={person.isActive}>
                    <span />{person.isActive ? "사용 중" : "사용 중지"}
                  </span>
                </div>

                <div className="person-direction-preview">
                  <div>
                    <span>한국어 → 일본어</span>
                    <strong>{person.aliases[0]} → {person.japaneseCanonical}</strong>
                  </div>
                  <div>
                    <span>일본어 → 한국어</span>
                    <strong>{person.japaneseCanonical} → {person.koreanCanonical}</strong>
                  </div>
                </div>

                <div className="person-aliases">
                  <div>
                    <span>한국어 인식 표현</span>
                    <b>{person.aliases.length}개</b>
                  </div>
                  <ul>
                    {person.aliases.map((alias) => <li key={alias}>{alias}</li>)}
                  </ul>
                </div>

                <div className="person-card-footer">
                  <small>번역 {person.usedCount.toLocaleString("ko-KR")}회 · {dateLabel(person.updatedAt)} 수정</small>
                  <div className="row-actions">
                    <button type="button" onClick={() => openEdit(person)}>수정</button>
                    <button
                      type="button"
                      disabled={busyId === person.id}
                      onClick={() => void setActive(person)}
                    >{person.isActive ? "사용 중지" : "다시 사용"}</button>
                    {person.usedCount === 0 && (
                      <button
                        className="danger-action"
                        type="button"
                        disabled={busyId === person.id}
                        onClick={() => void deletePerson(person)}
                      >삭제</button>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {filteredPeople.length === 0 && (
              <div className="people-empty people-grid-empty">조건에 맞는 인명·호칭 규칙이 없습니다.</div>
            )}
            <button className="person-add-card" type="button" onClick={openCreate}>
              <span>+</span>
              <strong>새 멤버 추가</strong>
              <small>한국어·일본어 표기와 인식 표현 등록</small>
            </button>
          </div>
        </section>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section className="glossary-modal people-modal" role="dialog" aria-modal="true" aria-labelledby="person-modal-title">
            <div className="modal-header">
              <div>
                <p className="section-kicker">{editing === "new" ? "NEW PERSON RULE" : "EDIT PERSON RULE"}</p>
                <h3 id="person-modal-title">{editing === "new" ? "새 멤버 등록" : "인명·호칭 수정"}</h3>
              </div>
              <button type="button" onClick={closeEditor} aria-label="인명·호칭 창 닫기">×</button>
            </div>

            <form className="person-form" onSubmit={savePerson} noValidate>
              <section className="person-form-section" aria-labelledby="alias-input-heading">
                <div className="person-form-heading">
                  <div>
                    <span>1</span>
                    <strong id="alias-input-heading">한국어 인식 표현</strong>
                  </div>
                  <small>Enter 또는 쉼표로 추가 · 최대 30개</small>
                </div>
                <div className="alias-input-box" data-invalid={Boolean(fieldErrors.aliases)}>
                  {form.aliases.map((alias) => (
                    <span className="alias-tag" key={alias}>
                      {alias}
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({
                          ...current,
                          aliases: current.aliases.filter((item) => item !== alias),
                        }))}
                        aria-label={`${alias} 삭제`}
                      >×</button>
                    </span>
                  ))}
                  <input
                    autoFocus
                    value={aliasDraft}
                    onChange={(event) => handleAliasChange(event.target.value)}
                    onBlur={commitAliasDraft}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        commitAliasDraft();
                      }
                    }}
                    placeholder={form.aliases.length ? "표현 추가" : "예: 이시와타리 대표님"}
                    aria-label="인식 표현 입력"
                  />
                </div>
                {fieldErrors.aliases && <small className="field-error" role="alert">{fieldErrors.aliases}</small>}
              </section>

              <section className="person-form-section" aria-labelledby="canonical-input-heading">
                <div className="person-form-heading">
                  <div>
                    <span>2</span>
                    <strong id="canonical-input-heading">언어별 통합 표기</strong>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    <span>일본어 통합 표기 <b>*</b></span>
                    <input
                      value={form.japaneseCanonical}
                      onChange={(event) => setForm((current) => ({ ...current, japaneseCanonical: event.target.value }))}
                      placeholder="예: 石渡さん"
                      aria-invalid={Boolean(fieldErrors.japaneseCanonical)}
                    />
                    {fieldErrors.japaneseCanonical && <small role="alert">{fieldErrors.japaneseCanonical}</small>}
                  </label>
                  <label>
                    <span>한국어 통합 표기 <b>*</b></span>
                    <input
                      value={form.koreanCanonical}
                      onChange={(event) => setForm((current) => ({ ...current, koreanCanonical: event.target.value }))}
                      placeholder="예: 이시와타리님"
                      aria-invalid={Boolean(fieldErrors.koreanCanonical)}
                    />
                    {fieldErrors.koreanCanonical && <small role="alert">{fieldErrors.koreanCanonical}</small>}
                  </label>
                </div>
                <label className="active-checkbox">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  />
                  <span>저장 후 번역에 바로 적용</span>
                </label>
              </section>

              <section className="person-preview" aria-labelledby="person-preview-heading">
                <div className="person-form-heading">
                  <div>
                    <span>3</span>
                    <strong id="person-preview-heading">양방향 변환 미리보기</strong>
                  </div>
                  <small>입력 내용에 따라 바로 바뀝니다.</small>
                </div>
                <div className="preview-grid">
                  <div>
                    <span>한국어 → 일본어</span>
                    {previewAliases.length ? previewAliases.map((alias) => (
                      <p key={alias}><b>{alias}</b><i>→</i><strong>{form.japaneseCanonical || "일본어 통합 표기"}</strong></p>
                    )) : <p className="preview-placeholder">인식 표현을 입력해 주세요.</p>}
                  </div>
                  <div>
                    <span>일본어 → 한국어</span>
                    <p>
                      <b>{form.japaneseCanonical || "일본어 통합 표기"}</b>
                      <i>→</i>
                      <strong>{form.koreanCanonical || "한국어 통합 표기"}</strong>
                    </p>
                  </div>
                </div>
              </section>

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
    </div>
  );
}
