import type { TranslationDirection } from "@/lib/language";

export const OPENING_GREETING_SITUATION = "첫인사";

const KOREAN_OPENING_GREETING =
  /^(?:\uFEFF)?\s*(안녕하세요|안녕하십니까|수고하십니다|수고\s+많으십니다)(?=$|[\s,.!?。！？，])/u;
const JAPANESE_OPENING_GREETING =
  /^(?:\uFEFF)?\s*(お疲れ様です)(?=$|[\s,.!?。！？，])/u;

const JAPANESE_RESULT_OPENING =
  /^(?:(?:こんにちは|(?:いつも)?お世話になっております|お疲れ(?:様|さま)です)[\s,.!?。！？，]*)+/u;
const KOREAN_RESULT_OPENING =
  /^(?:(?:안녕하세요|안녕하십니까|수고하십니다|수고\s+많으십니다)[\s,.!?。！？，]*)+/u;

export type OpeningGreetingMatch = {
  matchedText: string;
  requiredText: "お疲れ様です。" | "안녕하세요.";
};

export type OpeningGreetingEnforcement = {
  finalText: string;
  corrected: boolean;
  requiredText?: OpeningGreetingMatch["requiredText"];
};

export function isOpeningGreetingSituation(situation: string): boolean {
  return situation.normalize("NFKC").replace(/\s+/gu, "") === OPENING_GREETING_SITUATION;
}

export function detectOpeningGreeting(
  sourceText: string,
  direction: TranslationDirection,
): OpeningGreetingMatch | null {
  const match = sourceText.match(
    direction === "ko-ja" ? KOREAN_OPENING_GREETING : JAPANESE_OPENING_GREETING,
  );
  const matchedText = match?.[1];
  if (!matchedText) return null;

  return {
    matchedText,
    requiredText: direction === "ko-ja" ? "お疲れ様です。" : "안녕하세요.",
  };
}

function stripAlternativeOpening(
  finalText: string,
  direction: TranslationDirection,
): string {
  const trimmed = finalText.trimStart();
  return trimmed
    .replace(direction === "ko-ja" ? JAPANESE_RESULT_OPENING : KOREAN_RESULT_OPENING, "")
    .trimStart();
}

export function enforceOpeningGreeting(
  sourceText: string,
  direction: TranslationDirection,
  finalText: string,
): OpeningGreetingEnforcement {
  const match = detectOpeningGreeting(sourceText, direction);
  if (!match) return { finalText, corrected: false };

  const trimmed = finalText.trimStart();
  if (trimmed.startsWith(match.requiredText)) {
    return {
      finalText: trimmed,
      corrected: trimmed !== finalText,
      requiredText: match.requiredText,
    };
  }

  const remainder = stripAlternativeOpening(finalText, direction);
  const separator = remainder && direction === "ja-ko" ? " " : "";
  return {
    finalText: `${match.requiredText}${separator}${remainder}`,
    corrected: true,
    requiredText: match.requiredText,
  };
}
