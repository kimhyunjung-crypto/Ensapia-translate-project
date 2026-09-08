// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toneRuleFormInputSchema } from "@/lib/validation";
import { appendPhraseText, normalizePhrases } from "@/modules/tone/phrases";

describe("EPIC 8 tone phrase input", () => {
  it("normalizes full-width text and removes case-insensitive duplicates", () => {
    expect(normalizePhrases(["  ＰＬＥＡＳＥ  ", "please", "부탁드립니다", " 부탁드립니다 "])).toEqual([
      "PLEASE",
      "부탁드립니다",
    ]);
  });

  it("adds comma-separated phrases while preserving existing tags", () => {
    expect(appendPhraseText(["기존 표현"], "새 표현, 추가 표현,새 표현")).toEqual([
      "기존 표현",
      "새 표현",
      "추가 표현",
    ]);
  });

  it("requires both a situation and a recommended tone", () => {
    const result = toneRuleFormInputSchema.safeParse({
      situation: " ",
      recommendedTone: "",
      cushionPhrases: [],
      forbiddenPhrases: [],
      isActive: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "situation",
        "recommendedTone",
      ]);
    }
  });
});
