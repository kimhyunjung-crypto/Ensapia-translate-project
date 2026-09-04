// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkTranslationQuality } from "@/modules/translation/quality";
import type { FirstPassProviderInput } from "@/modules/translation/provider-inputs";

const condition: FirstPassProviderInput = {
  sourceText: "이시와타리 대표님, Ontos 요청 번호는 2026입니다.",
  direction: "ko-ja",
  rules: [
    {
      type: "person",
      priority: 1,
      ruleId: "person",
      version: 1,
      matchedTexts: ["이시와타리 대표님"],
      requiredText: "石渡さん",
    },
    {
      type: "glossary",
      priority: 2,
      ruleId: "ontos",
      version: 1,
      matchedText: "Ontos",
      requiredText: "Ontos（IAM）",
      forbiddenTerms: ["オンタス"],
    },
  ],
};

describe("EPIC 5 final quality check", () => {
  it("accepts the target language, numbers, and fixed terms", () => {
    const result = checkTranslationQuality(
      condition,
      "石渡さん、Ontos（IAM）の依頼番号は2026です。",
    );

    expect(result).toEqual({ passed: true, issues: [] });
  });

  it("rejects a result in the wrong target language", () => {
    const result = checkTranslationQuality(
      condition,
      "이시와타리님, Ontos（IAM） 요청 번호는 2026입니다.",
    );

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("WRONG_TARGET_LANGUAGE");
  });

  it("reports missing numbers, fixed terms, and forbidden terms", () => {
    const result = checkTranslationQuality(condition, "石渡様、オンタスの依頼です。");

    expect(result.issues.map((issue) => issue.code)).toEqual([
      "NUMBER_MISSING",
      "REQUIRED_TERM_MISSING",
      "FORBIDDEN_TERM_USED",
    ]);
  });

  it("checks the Japanese-to-Korean direction and accepts equivalent number formatting", () => {
    const reverseCondition: FirstPassProviderInput = {
      sourceText: "資料を1,000件確認してください。",
      direction: "ja-ko",
      rules: [],
    };

    expect(
      checkTranslationQuality(reverseCondition, "자료 1000건을 확인해 주세요."),
    ).toEqual({ passed: true, issues: [] });
    expect(
      checkTranslationQuality(reverseCondition, "資料を1,000件確認してください。"),
    ).toMatchObject({
      passed: false,
      issues: [expect.objectContaining({ code: "WRONG_TARGET_LANGUAGE" })],
    });
  });
});
