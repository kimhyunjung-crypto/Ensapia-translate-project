// @vitest-environment node
import { describe, expect, it } from "vitest";
import { appendAliasText, normalizeAlias, normalizeAliases } from "@/modules/people/aliases";

describe("EPIC 7 person alias input", () => {
  it("normalizes whitespace and full-width characters", () => {
    expect(normalizeAlias("  ＡＢＣ 담당자님  ")).toBe("ABC 담당자님");
  });

  it("removes duplicate aliases without changing the first display value", () => {
    expect(normalizeAliases(["이시와타리상", " 이시와타리상 ", "ABC", "ａｂｃ"])).toEqual([
      "이시와타리상",
      "ABC",
    ]);
  });

  it("adds comma-separated aliases and keeps existing tags", () => {
    expect(appendAliasText(["기존 표현"], "새 표현, 추가 표현,새 표현")).toEqual([
      "기존 표현",
      "새 표현",
      "추가 표현",
    ]);
  });
});
