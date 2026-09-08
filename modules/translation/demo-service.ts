import { AppError } from "@/lib/errors";
import {
  detectTranslationDirection,
  type TranslationDirection,
} from "@/lib/language";
import { QUALITY_EVALUATION_CASES } from "@/modules/quality/cases";

const DEMO_TRANSLATIONS = new Map<string, string>([
  ...QUALITY_EVALUATION_CASES.map(
    ({ sourceText, expectedText }) => [sourceText, expectedText] as const,
  ),
]);

const FALLBACK_TRANSLATIONS: Record<TranslationDirection, string> = {
  "ko-ja": "デモモードの練習用翻訳です。実際のAIはrealモードで使用します。",
  "ja-ko": "데모 모드의 연습용 번역입니다. 실제 AI는 real 모드에서 사용합니다.",
};

export type DemoTranslation = {
  direction: TranslationDirection;
  sourceLanguage: "ko" | "ja";
  targetLanguage: "ko" | "ja";
  finalText: string;
  demo: true;
};

export function createDemoTranslation(sourceText: string): DemoTranslation {
  const detection = detectTranslationDirection(sourceText);

  if (!detection.direction || !detection.sourceLanguage || !detection.targetLanguage) {
    throw new AppError(
      "UNSUPPORTED_LANGUAGE",
      "한국어 또는 일본어가 포함된 메시지를 입력해 주세요.",
    );
  }

  return {
    direction: detection.direction,
    sourceLanguage: detection.sourceLanguage,
    targetLanguage: detection.targetLanguage,
    finalText: DEMO_TRANSLATIONS.get(sourceText.trim()) ?? FALLBACK_TRANSLATIONS[detection.direction],
    demo: true,
  };
}
