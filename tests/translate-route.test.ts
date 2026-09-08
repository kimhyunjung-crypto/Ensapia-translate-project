// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslatePost } from "@/app/api/translate/route";
import { AppError } from "@/lib/errors";
import { TranslationSaveError } from "@/modules/translation/service";

function requestWithJson(value: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("demo translation route", () => {
  const loadCostGuard = vi.fn(async () => ({
    state: "normal" as const,
    spentUsd: 1,
    limitUsd: 10,
    warningAtUsd: 8,
    usageRatio: 0.1,
  }));
  const translate = vi.fn(async (sourceText: string) => {
    if (sourceText === "Ontos 123") {
      throw new AppError(
        "UNSUPPORTED_LANGUAGE",
        "한국어 또는 일본어가 포함된 메시지를 입력해 주세요.",
      );
    }

    const japanese = sourceText.includes("資料");
    return japanese
      ? {
          direction: "ja-ko" as const,
          sourceLanguage: "ja" as const,
          targetLanguage: "ko" as const,
          finalText: "안녕하세요. 자료를 확인해 주세요.",
          demo: true,
        }
      : {
          direction: "ko-ja" as const,
          sourceLanguage: "ko" as const,
          targetLanguage: "ja" as const,
          finalText: "こんにちは。会議の日程をご確認いただけますでしょうか。",
          demo: true,
        };
  });
  const post = createTranslatePost(translate, loadCostGuard);

  beforeEach(() => {
    translate.mockClear();
    loadCostGuard.mockClear();
  });

  it("returns one Japanese final result for Korean text", async () => {
    const sourceText = "안녕하세요. 회의 일정을 확인 부탁드립니다.";
    const response = await post(
      requestWithJson({ sourceText }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.translation).toEqual({
      direction: "ko-ja",
      sourceLanguage: "ko",
      targetLanguage: "ja",
      finalText: "こんにちは。会議の日程をご確認いただけますでしょうか。",
      demo: true,
    });
    expect(JSON.stringify(body)).not.toMatch(/openai|gemini|gpt/i);
    expect(translate).toHaveBeenCalledWith(sourceText);
  });

  it("returns one Korean final result for Japanese text", async () => {
    const response = await post(
      requestWithJson({ sourceText: "お世話になっております。資料をご確認ください。" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.translation.direction).toBe("ja-ko");
    expect(body.translation.finalText).toBe("안녕하세요. 자료를 확인해 주세요.");
  });

  it("rejects unsupported or malformed input with a safe message", async () => {
    const unsupported = await post(requestWithJson({ sourceText: "Ontos 123" }));
    const unsupportedBody = await unsupported.json();
    const malformed = await post(
      new Request("http://127.0.0.1:3000/api/translate", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(unsupported.status).toBe(400);
    expect(unsupportedBody.error).toEqual({
      code: "UNSUPPORTED_LANGUAGE",
      message: "한국어 또는 일본어가 포함된 메시지를 입력해 주세요.",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation after the monthly limit is reached", async () => {
    const limitedGuard = vi.fn(async () => ({
      state: "confirmation_required" as const,
      spentUsd: 10,
      limitUsd: 10,
      warningAtUsd: 8,
      usageRatio: 1,
    }));
    const limitedPost = createTranslatePost(translate, limitedGuard);
    const sourceText = "비용 한도 이후 번역을 확인합니다.";

    const blocked = await limitedPost(requestWithJson({ sourceText }));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      error: { code: "COST_CONFIRMATION_REQUIRED" },
    });
    expect(translate).not.toHaveBeenCalled();

    const confirmed = await limitedPost(requestWithJson({ sourceText, costConfirmed: true }));
    expect(confirmed.status).toBe(200);
    expect(translate).toHaveBeenCalledWith(sourceText);
  });

  it("returns a dedicated recovery token when only persistence fails", async () => {
    const recoveryId = "aa58b192-1ed8-4384-b14d-9de638d86f2a";
    const saveFailure = vi.fn(async () => {
      throw new TranslationSaveError(recoveryId);
    });
    const saveFailurePost = createTranslatePost(saveFailure, loadCostGuard);

    const response = await saveFailurePost(
      requestWithJson({ sourceText: "저장 실패를 구분해 주세요." }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TRANSLATION_SAVE_FAILED",
        message: "번역은 완료했지만 기록을 저장하지 못했습니다. AI를 다시 호출하지 않고 저장만 다시 시도해 주세요.",
      },
      recoveryId,
    });
  });
});
