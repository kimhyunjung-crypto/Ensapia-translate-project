import { describe, expect, it } from "vitest";
import { detectTranslationDirection, languageLabel } from "@/lib/language";

describe("Korean and Japanese direction detection", () => {
  it("detects Korean source text and selects Japanese", () => {
    expect(detectTranslationDirection("안녕하세요. Ontos 확인 부탁드립니다.")).toEqual({
      sourceLanguage: "ko",
      targetLanguage: "ja",
      direction: "ko-ja",
      label: "한국어 → 일본어",
    });
  });

  it("detects Japanese kana or kanji and selects Korean", () => {
    expect(detectTranslationDirection("資料をご確認ください。").direction).toBe("ja-ko");
    expect(detectTranslationDirection("資料確認").direction).toBe("ja-ko");
  });

  it("leaves unsupported text undetermined", () => {
    expect(detectTranslationDirection("Ontos 123")).toMatchObject({
      sourceLanguage: null,
      targetLanguage: null,
      direction: null,
      label: "언어 자동 감지",
    });
  });

  it("returns user-facing language labels", () => {
    expect(languageLabel("ko")).toBe("한국어");
    expect(languageLabel("ja")).toBe("일본어");
    expect(languageLabel(null)).toBe("목표 언어");
  });
});
