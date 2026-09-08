import { describe, expect, it } from "vitest";
import { QUALITY_EVALUATION_CASES } from "@/modules/quality/cases";
import { CORE_CONTRAST_PAIRS, contrastRatio } from "@/modules/quality/contrast";
import {
  evaluateQualityCase,
  summarizeQualityResults,
} from "@/modules/quality/evaluation";
import { createCompletionReport } from "@/modules/quality/report";
import { createDemoTranslation } from "@/modules/translation/demo-service";

describe("EPIC 11 quality evaluation", () => {
  it("keeps exactly 25 cases for each translation direction", () => {
    expect(QUALITY_EVALUATION_CASES).toHaveLength(50);
    expect(QUALITY_EVALUATION_CASES.filter((item) => item.direction === "ko-ja")).toHaveLength(25);
    expect(QUALITY_EVALUATION_CASES.filter((item) => item.direction === "ja-ko")).toHaveLength(25);
    expect(new Set(QUALITY_EVALUATION_CASES.map((item) => item.id)).size).toBe(50);
    expect(new Set(QUALITY_EVALUATION_CASES.map((item) => item.sourceText)).size).toBe(50);
  });

  it("passes all 50 curated cases through the demo translation path", () => {
    const results = QUALITY_EVALUATION_CASES.map((testCase) =>
      evaluateQualityCase(testCase, createDemoTranslation(testCase.sourceText).finalText),
    );

    expect(summarizeQualityResults(results)).toEqual({
      total: 50,
      passed: 50,
      failed: 0,
      koreanToJapanese: 25,
      japaneseToKorean: 25,
      majorErrorOrOmission: 0,
      fixedNotationChecks: 13,
      fixedNotationFailures: 0,
      fixedNotationPassed: 13,
      untranslatedPhraseFailures: 0,
    });
  });

  it("flags missing numbers, fixed notation, and untranslated target text", () => {
    const fixedTermCase = QUALITY_EVALUATION_CASES.find((item) => item.id === "KO-JA-13");
    const reverseCase = QUALITY_EVALUATION_CASES.find((item) => item.id === "JA-KO-01");
    expect(fixedTermCase).toBeDefined();
    expect(reverseCase).toBeDefined();

    const missing = evaluateQualityCase(fixedTermCase!, "バージョンを更新してください。");
    expect(missing).toMatchObject({
      passed: false,
      majorErrorOrOmission: true,
      fixedNotationPassed: false,
    });
    expect(missing.notes).toEqual(expect.arrayContaining(["숫자 누락", "고정 표기 누락"]));

    const untranslated = evaluateQualityCase(reverseCase!, reverseCase!.sourceText);
    expect(untranslated).toMatchObject({
      passed: false,
      majorErrorOrOmission: true,
      untranslatedPhraseFound: true,
    });
  });
});

describe("EPIC 11 completion evidence", () => {
  it("meets WCAG AA contrast for core text pairs", () => {
    for (const pair of CORE_CONTRAST_PAIRS) {
      expect(contrastRatio(pair.foreground, pair.background), pair.label).toBeGreaterThanOrEqual(
        pair.minimum,
      );
    }
  });

  it("reports six integrated flows and every PRD scope group", () => {
    const report = createCompletionReport();

    expect(report.integrationChecks).toHaveLength(6);
    expect(report.integrationChecks.every((check) => check.status === "passed")).toBe(true);
    expect(report.prdGroups.map((group) => group.id)).toEqual([
      "screens",
      "core",
      "excluded",
      "success",
    ]);
    expect(
      report.prdGroups
        .flatMap((group) => group.checks)
        .filter((check) => check.status === "pending-operation"),
    ).toHaveLength(2);
    expect(report.contrastPassed).toBe(true);
  });
});
