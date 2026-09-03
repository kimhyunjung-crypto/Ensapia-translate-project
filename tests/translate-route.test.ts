// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslatePost } from "@/app/api/translate/route";

function requestWithJson(value: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("demo translation route", () => {
  const prepareProviderRequests = vi.fn(async () => undefined);
  const post = createTranslatePost(prepareProviderRequests);

  beforeEach(() => {
    prepareProviderRequests.mockClear();
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
    expect(prepareProviderRequests).toHaveBeenCalledWith(sourceText, "ko-ja");
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
    expect(prepareProviderRequests).not.toHaveBeenCalled();
  });
});
