// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRecoverTranslationPost } from "@/app/api/translate/recover/route";
import { TranslationSaveError } from "@/modules/translation/service";

const recoveryId = "aa58b192-1ed8-4384-b14d-9de638d86f2a";

function request(value: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/translate/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("EPIC 10 translation persistence recovery route", () => {
  it("returns the already completed translation after saving its records", async () => {
    const retry = vi.fn(async () => ({
      direction: "ko-ja" as const,
      sourceLanguage: "ko" as const,
      targetLanguage: "ja" as const,
      finalText: "保存を再試行しました。",
      demo: true,
    }));
    const response = await createRecoverTranslationPost(retry)(request({ recoveryId }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      translation: { finalText: "保存を再試行しました。" },
    });
    expect(retry).toHaveBeenCalledWith(recoveryId);
  });

  it("keeps the same recovery token when persistence is still unavailable", async () => {
    const retry = vi.fn(async () => {
      throw new TranslationSaveError(recoveryId);
    });
    const response = await createRecoverTranslationPost(retry)(request({ recoveryId }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "TRANSLATION_SAVE_FAILED" },
      recoveryId,
    });
  });
});
