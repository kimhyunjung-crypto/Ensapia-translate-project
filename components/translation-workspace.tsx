"use client";

import { useMemo, useState } from "react";
import {
  detectTranslationDirection,
  languageLabel,
  type TranslationDirection,
} from "@/lib/language";
import {
  countCharacters,
  TRANSLATION_CHARACTER_LIMIT,
  translationInputSchema,
} from "@/lib/validation";

type TranslationState = "idle" | "translating" | "success" | "error";
type CopyState = "idle" | "copied" | "error";

type TranslationResponse = {
  ok: true;
  translation: {
    direction: TranslationDirection;
    targetLanguage: "ko" | "ja";
    finalText: string;
    demo: boolean;
  };
};

type ErrorResponse = {
  ok: false;
  error?: { message?: string };
};

const MINIMUM_PROGRESS_TIME = 400;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isTranslationResponse(value: unknown): value is TranslationResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<TranslationResponse>;
  return Boolean(
    response.ok === true &&
      response.translation &&
      typeof response.translation.finalText === "string" &&
      (response.translation.targetLanguage === "ko" || response.translation.targetLanguage === "ja"),
  );
}

export function TranslationWorkspace() {
  const [sourceText, setSourceText] = useState("");
  const [state, setState] = useState<TranslationState>("idle");
  const [finalText, setFinalText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [inputError, setInputError] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [targetLanguage, setTargetLanguage] = useState<"ko" | "ja" | null>(null);
  const [isDemoResult, setIsDemoResult] = useState(false);

  const characterCount = countCharacters(sourceText);
  const detection = useMemo(() => detectTranslationDirection(sourceText), [sourceText]);
  const isOverLimit = characterCount > TRANSLATION_CHARACTER_LIMIT;

  function handleSourceChange(value: string) {
    setSourceText(value);
    setState("idle");
    setFinalText("");
    setErrorMessage("");
    setCopyState("idle");
    setTargetLanguage(null);
    setIsDemoResult(false);

    if (countCharacters(value) > TRANSLATION_CHARACTER_LIMIT) {
      setInputError(
        `현재 ${countCharacters(value).toLocaleString("ko-KR")}자입니다. 최대 3,000자까지 입력할 수 있습니다.`,
      );
    } else {
      setInputError("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = translationInputSchema.safeParse({ sourceText });

    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "입력 내용을 확인해 주세요.");
      return;
    }

    if (!detection.direction) {
      setInputError("한국어 또는 일본어가 포함된 메시지를 입력해 주세요.");
      return;
    }

    setInputError("");
    setErrorMessage("");
    setFinalText("");
    setCopyState("idle");
    setState("translating");

    try {
      const [response] = await Promise.all([
        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceText }),
        }),
        wait(MINIMUM_PROGRESS_TIME),
      ]);
      const body = (await response.json().catch(() => null)) as
        | TranslationResponse
        | ErrorResponse
        | null;

      if (!response.ok || !isTranslationResponse(body)) {
        const safeMessage = body && "error" in body ? body.error?.message : undefined;
        throw new Error(safeMessage || "번역을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      setFinalText(body.translation.finalText);
      setTargetLanguage(body.translation.targetLanguage);
      setIsDemoResult(body.translation.demo);
      setState("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "번역을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setState("error");
    }
  }

  async function handleCopy() {
    if (!finalText) return;

    try {
      await navigator.clipboard.writeText(finalText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="translation-grid" aria-label="번역 작업 영역">
        <article className="translation-card source-card">
          <div className="card-header">
            <div>
              <label className="card-label" htmlFor="translation-source">원문</label>
              <span className="language-chip" data-testid="translation-direction">
                {detection.label}
              </span>
            </div>
            <span
              className="character-count"
              data-over-limit={isOverLimit || undefined}
              aria-live="polite"
            >
              {characterCount.toLocaleString("ko-KR")} / 3,000자
            </span>
          </div>

          <textarea
            id="translation-source"
            className="source-textarea"
            value={sourceText}
            onChange={(event) => handleSourceChange(event.target.value)}
            placeholder="번역할 Slack 메시지를 입력하거나 붙여 넣으세요."
            aria-describedby="translation-source-help translation-source-error"
            aria-invalid={Boolean(inputError)}
            disabled={state === "translating"}
            autoFocus
          />

          <div className="source-feedback">
            <p id="translation-source-error" className="input-error" role={inputError ? "alert" : undefined}>
              {inputError}
            </p>
            <div id="translation-source-help" className="source-hint">
              <span>한국어 ↔ 일본어</span>
              <span>공백·줄바꿈 포함 최대 3,000자</span>
            </div>
          </div>
        </article>

        <div className="translate-action-wrap">
          <button
            className="translate-button"
            type="submit"
            disabled={state === "translating"}
            aria-busy={state === "translating"}
          >
            {state === "translating" && <span className="button-spinner" aria-hidden="true" />}
            <span>{state === "translating" ? "번역 중" : state === "error" ? "다시 시도" : "번역하기"}</span>
            {state !== "translating" && <b aria-hidden="true">→</b>}
          </button>
          <span className="auto-copy">AUTO DIRECTION</span>
        </div>

        <article className="translation-card result-card" aria-live="polite">
          <div className="card-header">
            <div>
              <span className="card-label">최종 번역본</span>
              <span className="language-chip result">{languageLabel(targetLanguage)}</span>
            </div>
            <button
              className="copy-button"
              type="button"
              onClick={handleCopy}
              disabled={!finalText || state !== "success"}
            >
              {copyState === "copied" ? "복사됨" : "복사"}
            </button>
          </div>

          {state === "success" ? (
            <div className="translation-result" data-testid="final-translation">
              <p>{finalText}</p>
            </div>
          ) : state === "translating" ? (
            <div className="translation-status">
              <span className="result-spinner" aria-hidden="true" />
              <strong>번역 중</strong>
              <small>최종 번역본을 준비하고 있습니다.</small>
            </div>
          ) : state === "error" ? (
            <div className="translation-error" role="alert">
              <span aria-hidden="true">!</span>
              <h3>번역을 완료하지 못했습니다</h3>
              <p>{errorMessage}</p>
              <small>원문은 그대로 유지됩니다. 가운데 ‘다시 시도’를 눌러 주세요.</small>
            </div>
          ) : (
            <div className="empty-result">
              <span>완성된 최종 번역본이 여기에 표시됩니다.</span>
              <small>모델별 중간 결과는 표시하지 않습니다.</small>
            </div>
          )}

          <div className="result-footer">
            <span><span className="quality-dot" /> ENSAPIA 기준 적용</span>
            {isDemoResult && <span className="demo-result-label">화면 동작 확인용 데모 결과</span>}
            {copyState === "error" && <span className="copy-error" role="alert">복사하지 못했습니다.</span>}
          </div>
        </article>
      </div>
    </form>
  );
}
