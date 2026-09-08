import { AppError } from "@/lib/errors";
import type { FirstPassProviderInput } from "@/modules/translation/provider-inputs";

export type QualityIssueCode =
  | "HARD_RULE_VIOLATION"
  | "WRONG_TARGET_LANGUAGE"
  | "NUMBER_MISSING"
  | "REQUIRED_TERM_MISSING"
  | "FORBIDDEN_TERM_USED";

export type QualityIssue = {
  code: QualityIssueCode;
  message: string;
};

export type QualityCheck = {
  passed: boolean;
  issues: QualityIssue[];
};

const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af]/u;
const KANA_PATTERN = /[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]/u;
const JAPANESE_SCRIPT_PATTERN = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uff65-\uff9f]/u;

function extractNumbers(text: string): string[] {
  return (text.normalize("NFKC").match(/\d+(?:[.,]\d+)*/g) ?? []).map((value) =>
    value.replaceAll(",", ""),
  );
}

function missingNumbers(sourceText: string, finalText: string): string[] {
  const remaining = extractNumbers(finalText);
  const missing: string[] = [];

  for (const value of extractNumbers(sourceText)) {
    const index = remaining.indexOf(value);
    if (index === -1) missing.push(value);
    else remaining.splice(index, 1);
  }

  return missing;
}

function hasWrongTargetLanguage(
  direction: FirstPassProviderInput["direction"],
  finalText: string,
): boolean {
  if (direction === "ko-ja") {
    return HANGUL_PATTERN.test(finalText) || !JAPANESE_SCRIPT_PATTERN.test(finalText);
  }

  return KANA_PATTERN.test(finalText) || !HANGUL_PATTERN.test(finalText);
}

export function checkTranslationQuality(
  condition: FirstPassProviderInput,
  finalText: string,
): QualityCheck {
  const issues: QualityIssue[] = [];

  const openingGreetingRule = condition.rules.find(
    (rule) => rule.type === "hard",
  );
  if (
    openingGreetingRule &&
    !finalText.trimStart().startsWith(openingGreetingRule.requiredText)
  ) {
    issues.push({
      code: "HARD_RULE_VIOLATION",
      message: `최종 번역이 첫인사 필수 표기 ‘${openingGreetingRule.requiredText}’로 시작하지 않습니다.`,
    });
  }

  if (hasWrongTargetLanguage(condition.direction, finalText)) {
    issues.push({
      code: "WRONG_TARGET_LANGUAGE",
      message: "최종 번역의 목표 언어가 올바르지 않습니다. 다시 시도해 주세요.",
    });
  }

  if (missingNumbers(condition.sourceText, finalText).length > 0) {
    issues.push({
      code: "NUMBER_MISSING",
      message: "최종 번역에서 원문의 숫자가 누락되었습니다. 다시 시도해 주세요.",
    });
  }

  const fixedRules = condition.rules.filter(
    (rule) => rule.type === "person" || rule.type === "glossary",
  );
  if (fixedRules.some((rule) => !finalText.includes(rule.requiredText))) {
    issues.push({
      code: "REQUIRED_TERM_MISSING",
      message: "최종 번역에서 고정 표기가 누락되었습니다. 다시 시도해 주세요.",
    });
  }

  const forbiddenTerms = condition.rules.flatMap((rule) =>
    rule.type === "glossary" ? rule.forbiddenTerms : [],
  );
  if (forbiddenTerms.some((term) => finalText.includes(term))) {
    issues.push({
      code: "FORBIDDEN_TERM_USED",
      message: "최종 번역에 사용하면 안 되는 표기가 포함되었습니다. 다시 시도해 주세요.",
    });
  }

  return { passed: issues.length === 0, issues };
}

export function assertTranslationQuality(
  condition: FirstPassProviderInput,
  finalText: string,
): QualityCheck {
  const result = checkTranslationQuality(condition, finalText);
  const firstIssue = result.issues[0];

  if (firstIssue) throw new AppError(firstIssue.code, firstIssue.message, 422);
  return result;
}
