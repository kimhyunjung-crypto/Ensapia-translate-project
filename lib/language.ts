export type SupportedLanguage = "ko" | "ja";
export type TranslationDirection = "ko-ja" | "ja-ko";

export type LanguageDetection = {
  sourceLanguage: SupportedLanguage | null;
  targetLanguage: SupportedLanguage | null;
  direction: TranslationDirection | null;
  label: string;
};

const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af]/gu;
const KANA_PATTERN = /[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]/gu;
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/gu;

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

export function detectTranslationDirection(sourceText: string): LanguageDetection {
  const hangulCount = countMatches(sourceText, HANGUL_PATTERN);
  const kanaCount = countMatches(sourceText, KANA_PATTERN);
  const cjkCount = countMatches(sourceText, CJK_PATTERN);

  if (hangulCount > 0 && hangulCount >= kanaCount) {
    return {
      sourceLanguage: "ko",
      targetLanguage: "ja",
      direction: "ko-ja",
      label: "한국어 → 일본어",
    };
  }

  if (kanaCount > 0 || cjkCount > 0) {
    return {
      sourceLanguage: "ja",
      targetLanguage: "ko",
      direction: "ja-ko",
      label: "일본어 → 한국어",
    };
  }

  return {
    sourceLanguage: null,
    targetLanguage: null,
    direction: null,
    label: "언어 자동 감지",
  };
}

export function languageLabel(language: SupportedLanguage | null): string {
  if (language === "ko") return "한국어";
  if (language === "ja") return "일본어";
  return "목표 언어";
}
