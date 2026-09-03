// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GlossaryTermRecord } from "@/modules/glossary/repository";
import type { PersonRecord } from "@/modules/people/repository";
import { buildTranslationCondition } from "@/modules/rules/engine";
import type { ToneRuleRecord } from "@/modules/tone/repository";
import { createFirstPassProviderRequests } from "@/modules/translation/provider-inputs";

const people: PersonRecord[] = [
  {
    id: "person-ishiwatari",
    japaneseCanonical: "石渡さん",
    koreanCanonical: "이시와타리님",
    aliases: ["이시와타리 대표님", "이시와타리상"],
    isActive: true,
    usedCount: 0,
  },
];

const glossary: GlossaryTermRecord[] = [
  {
    id: "glossary-title",
    sourceText: "대표님",
    targetText: "代表様",
    direction: "ko-ja",
    forbiddenTerms: [],
    isActive: true,
    usedCount: 0,
  },
  {
    id: "glossary-ontos",
    sourceText: "Ontos",
    targetText: "Ontos（IAM）",
    direction: "ko-ja",
    forbiddenTerms: ["온토스"],
    isActive: true,
    usedCount: 0,
  },
];

const tones: ToneRuleRecord[] = [
  {
    id: "tone-request",
    situation: "요청",
    recommendedTone: "상대의 사정을 존중하는 정중한 업무 어조",
    cushionPhrases: ["번거로우시겠지만"],
    forbiddenPhrases: ["당장 처리하세요"],
    isActive: true,
    usedCount: 0,
    version: 3,
  },
];

describe("EPIC 4 pre-translation rules engine", () => {
  it("applies person, glossary, and tone priority without rewriting the source", () => {
    const sourceText = "  이시와타리 대표님, Ontos 연습 계정 권한 확인을 부탁드립니다.\n";
    const condition = buildTranslationCondition(sourceText, "ko-ja", {
      glossary,
      people,
      tones,
    });

    expect(condition.sourceText).toBe(sourceText);
    expect(condition.rules.map((rule) => [rule.type, rule.priority])).toEqual([
      ["person", 1],
      ["glossary", 2],
      ["tone", 3],
    ]);
    expect(condition.rules).toContainEqual(
      expect.objectContaining({
        type: "person",
        matchedTexts: ["이시와타리 대표님"],
        requiredText: "石渡さん",
      }),
    );
    expect(condition.rules).toContainEqual(
      expect.objectContaining({
        type: "glossary",
        ruleId: "glossary-ontos",
        requiredText: "Ontos（IAM）",
      }),
    );
    expect(condition.rules).not.toContainEqual(
      expect.objectContaining({ ruleId: "glossary-title" }),
    );
  });

  it("creates independent but identical inputs for OpenAI and Gemini", () => {
    const sourceText = "이시와타리 대표님께 부탁드립니다.";
    const condition = buildTranslationCondition(sourceText, "ko-ja", {
      glossary,
      people,
      tones,
    });
    const requests = createFirstPassProviderRequests(condition);

    expect(requests.openai.input).toEqual(requests.gemini.input);
    expect(requests.openai.input).not.toBe(requests.gemini.input);
    expect(requests.openai.input.rules).not.toBe(requests.gemini.input.rules);
    expect(requests.openai.input.sourceText).toBe(sourceText);
  });

  it("uses the Korean canonical name for Japanese source and ignores inactive rules", () => {
    const condition = buildTranslationCondition("石渡さん、ご確認をお願いします。", "ja-ko", {
      glossary: [
        {
          ...glossary[0],
          id: "inactive-ja-term",
          sourceText: "確認",
          targetText: "점검",
          direction: "ja-ko",
          isActive: false,
        },
      ],
      people,
      tones: tones.map((tone) => ({ ...tone, isActive: false })),
    });

    expect(condition.rules).toEqual([
      expect.objectContaining({
        type: "person",
        matchedTexts: ["石渡さん"],
        requiredText: "이시와타리님",
      }),
    ]);
  });
});
