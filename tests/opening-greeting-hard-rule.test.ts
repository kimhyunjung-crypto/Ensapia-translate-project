// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ReviewOutput } from "@/modules/ai/schemas";
import {
  detectOpeningGreeting,
  enforceOpeningGreeting,
  isOpeningGreetingSituation,
} from "@/modules/rules/opening-greeting";
import { buildTranslationCondition } from "@/modules/rules/engine";
import type { ToneRuleRecord } from "@/modules/tone/repository";
import {
  buildDraftPrompt,
  buildFinalPrompt,
  buildReviewPrompt,
  HARD_RULE_INSTRUCTION,
  hardenSystemInstruction,
} from "@/modules/translation/prompts";
import { checkTranslationQuality } from "@/modules/translation/quality";

const openingGreeting: ToneRuleRecord = {
  id: "tone-opening-greeting",
  situation: "첫인사",
  recommendedTone: "메시지 첫머리 인사를 필수 표기로 변환",
  cushionPhrases: [],
  forbiddenPhrases: [],
  isActive: true,
  usedCount: 0,
  version: 2,
};

const requestTone: ToneRuleRecord = {
  id: "tone-request",
  situation: "요청",
  recommendedTone: "정중한 요청 어조",
  cushionPhrases: ["번거로우시겠지만"],
  forbiddenPhrases: [],
  isActive: true,
  usedCount: 0,
  version: 1,
};

function condition(sourceText: string, direction: "ko-ja" | "ja-ko") {
  return buildTranslationCondition(sourceText, direction, {
    glossary: [],
    people: [],
    tones: [openingGreeting, requestTone],
  });
}

function passingReview(improvedText: string): ReviewOutput {
  const passed = { passed: true, notes: [] as string[] };
  return {
    improvedText,
    checks: {
      mistranslation: { ...passed },
      omissions: { ...passed },
      terminology: { ...passed },
      tone: { ...passed },
      untranslated: { ...passed },
      naturalness: { ...passed },
    },
  };
}

describe("opening greeting hard rule", () => {
  it("detects supported greetings only at the start of a message", () => {
    for (const sourceText of [
      "안녕하세요. 확인 부탁드립니다.",
      "  수고하십니다! 확인 부탁드립니다.",
      "\n수고 많으십니다. 확인 부탁드립니다.",
      "안녕하십니까? 확인 부탁드립니다.",
    ]) {
      expect(detectOpeningGreeting(sourceText, "ko-ja")?.requiredText).toBe("お疲れ様です。");
    }
    for (const sourceText of [
      "お疲れ様です。資料をご確認ください。",
      " お疲れ様です！資料をご確認ください。",
      "\nお疲れ様です 資料をご確認ください。",
    ]) {
      expect(detectOpeningGreeting(sourceText, "ja-ko")?.requiredText).toBe("안녕하세요.");
    }

    expect(detectOpeningGreeting("회의 중간에 안녕하세요.라고 인사했습니다.", "ko-ja")).toBeNull();
    expect(detectOpeningGreeting("本文でお疲れ様ですと伝えました。", "ja-ko")).toBeNull();
    expect(isOpeningGreetingSituation(" 첫 인사 ")).toBe(true);
  });

  it("selects the hard rule before a normal tone rule without replacing that tone", () => {
    const result = condition("안녕하세요. 자료 확인을 부탁드립니다.", "ko-ja");

    expect(result.rules).toEqual([
      expect.objectContaining({
        type: "hard",
        priority: 0,
        category: "opening_greeting",
        ruleId: openingGreeting.id,
        requiredText: "お疲れ様です。",
        requiredPosition: "start",
      }),
      expect.objectContaining({
        type: "tone",
        ruleId: requestTone.id,
        situation: "요청",
      }),
    ]);
  });

  it("does not select the hard rule for a middle greeting or an inactive rule", () => {
    expect(condition("본문에서 안녕하세요.라고 말했습니다.", "ko-ja").rules).toHaveLength(0);
    const inactive = buildTranslationCondition("안녕하세요. 확인 부탁드립니다.", "ko-ja", {
      glossary: [],
      people: [],
      tones: [{ ...openingGreeting, isActive: false }, requestTone],
    });
    expect(inactive.rules.some((rule) => rule.type === "hard")).toBe(false);
    expect(inactive.rules).toContainEqual(expect.objectContaining({ type: "tone", situation: "요청" }));
  });

  it("replaces alternative opening greetings and preserves the remaining message", () => {
    expect(
      enforceOpeningGreeting(
        "안녕하세요. 회의 일정을 확인해 주세요.",
        "ko-ja",
        "いつもお世話になっております。会議日程をご確認ください。",
      ),
    ).toEqual({
      finalText: "お疲れ様です。会議日程をご確認ください。",
      corrected: true,
      requiredText: "お疲れ様です。",
    });
    expect(
      enforceOpeningGreeting(
        "お疲れ様です！資料をご確認ください。",
        "ja-ko",
        "수고 많으십니다. 자료를 확인해 주세요.",
      ).finalText,
    ).toBe("안녕하세요. 자료를 확인해 주세요.");
    expect(
      enforceOpeningGreeting(
        "본문에서 안녕하세요.라고 말했습니다.",
        "ko-ja",
        "本文でこんにちはと伝えました。",
      ),
    ).toEqual({ finalText: "本文でこんにちはと伝えました。", corrected: false });
  });

  it("places the same hard rule in draft, review, final, and system instructions", () => {
    const hardCondition = condition("안녕하세요. 확인을 부탁드립니다.", "ko-ja");
    const drafts = {
      openai: { translatedText: "こんにちは。ご確認ください。" },
      gemini: { translatedText: "お世話になっております。ご確認ください。" },
    };
    const reviews = {
      openai: passingReview(drafts.gemini.translatedText),
      gemini: passingReview(drafts.openai.translatedText),
    };
    const prompts = [
      buildDraftPrompt(hardCondition),
      buildReviewPrompt({
        condition: hardCondition,
        candidateProvider: "gemini",
        candidateText: drafts.gemini.translatedText,
      }),
      buildFinalPrompt({ condition: hardCondition, drafts, reviews }),
      hardenSystemInstruction("번역하세요."),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain("hardRules");
      expect(prompt).toContain("최우선");
    }
    expect(prompts.slice(0, 3).every((prompt) => prompt.includes("お疲れ様です。"))).toBe(true);
    expect(hardenSystemInstruction("번역하세요.")).toContain(HARD_RULE_INSTRUCTION);
  });

  it("reports a start-position violation before code-level correction", () => {
    const hardCondition = condition("안녕하세요. 확인을 부탁드립니다.", "ko-ja");

    expect(
      checkTranslationQuality(hardCondition, "こんにちは。内容をご確認ください。").issues,
    ).toContainEqual(expect.objectContaining({ code: "HARD_RULE_VIOLATION" }));
    expect(
      checkTranslationQuality(hardCondition, "お疲れ様です。内容をご確認ください。").issues,
    ).not.toContainEqual(expect.objectContaining({ code: "HARD_RULE_VIOLATION" }));
  });
});
