import type { AppliedRule } from "@/modules/rules/engine";
import { checkTranslationQuality } from "@/modules/translation/quality";
import type { QualityEvaluationCase } from "@/modules/quality/cases";

export type QualityEvaluationResult = {
  caseId: string;
  direction: QualityEvaluationCase["direction"];
  sourceText: string;
  expectedText: string;
  candidateText: string;
  majorErrorOrOmission: boolean;
  requiredTermCount: number;
  missingRequiredTerms: string[];
  fixedNotationPassed: boolean;
  untranslatedPhraseFound: boolean;
  passed: boolean;
  notes: string[];
};

function normalizeForComparison(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function qualityRules(testCase: QualityEvaluationCase): AppliedRule[] {
  return testCase.requiredTerms.map((requiredText, index) => ({
    type: "glossary" as const,
    priority: 2 as const,
    ruleId: `${testCase.id}-term-${index + 1}`,
    version: 1,
    matchedText: requiredText,
    requiredText,
    forbiddenTerms: [],
  }));
}

export function evaluateQualityCase(
  testCase: QualityEvaluationCase,
  candidateText: string,
): QualityEvaluationResult {
  const quality = checkTranslationQuality(
    {
      sourceText: testCase.sourceText,
      direction: testCase.direction,
      rules: qualityRules(testCase),
    },
    candidateText,
  );
  const issueCodes = new Set(quality.issues.map((issue) => issue.code));
  const matchesReference =
    normalizeForComparison(candidateText) === normalizeForComparison(testCase.expectedText);
  const missingRequiredTerms = testCase.requiredTerms.filter(
    (term) => !candidateText.includes(term),
  );
  const fixedNotationPassed = missingRequiredTerms.length === 0;
  const untranslatedPhraseFound =
    issueCodes.has("WRONG_TARGET_LANGUAGE") ||
    normalizeForComparison(candidateText).includes(normalizeForComparison(testCase.sourceText));
  const majorErrorOrOmission =
    !matchesReference ||
    issueCodes.has("NUMBER_MISSING") ||
    !fixedNotationPassed ||
    untranslatedPhraseFound;
  const notes: string[] = [];

  if (!matchesReference) notes.push("검수 기준문과 일치하지 않음");
  if (issueCodes.has("NUMBER_MISSING")) notes.push("숫자 누락");
  if (!fixedNotationPassed) notes.push("고정 표기 누락");
  if (untranslatedPhraseFound) notes.push("목표 언어 또는 미번역 문구 오류");
  if (notes.length === 0) notes.push("기준문·숫자·고정 표기·목표 언어 통과");

  return {
    caseId: testCase.id,
    direction: testCase.direction,
    sourceText: testCase.sourceText,
    expectedText: testCase.expectedText,
    candidateText,
    majorErrorOrOmission,
    requiredTermCount: testCase.requiredTerms.length,
    missingRequiredTerms,
    fixedNotationPassed,
    untranslatedPhraseFound,
    passed: !majorErrorOrOmission,
    notes,
  };
}

export function summarizeQualityResults(results: readonly QualityEvaluationResult[]) {
  const fixedNotationChecks = results.reduce(
    (total, result) => total + result.requiredTermCount,
    0,
  );
  const fixedNotationFailures = results.reduce(
    (total, result) => total + result.missingRequiredTerms.length,
    0,
  );

  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    koreanToJapanese: results.filter((result) => result.direction === "ko-ja").length,
    japaneseToKorean: results.filter((result) => result.direction === "ja-ko").length,
    majorErrorOrOmission: results.filter((result) => result.majorErrorOrOmission).length,
    fixedNotationChecks,
    fixedNotationFailures,
    fixedNotationPassed: fixedNotationChecks - fixedNotationFailures,
    untranslatedPhraseFailures: results.filter((result) => result.untranslatedPhraseFound).length,
  };
}
