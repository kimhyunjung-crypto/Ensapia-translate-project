import { describe, expect, it } from "vitest";
import { toSafeError } from "@/lib/errors";
import { translationInputSchema } from "@/lib/validation";

describe("shared input validation and safe errors", () => {
  it("accepts a message up to 3,000 characters", () => {
    expect(translationInputSchema.parse({ sourceText: "가".repeat(3_000) }).sourceText).toHaveLength(
      3_000,
    );
  });

  it("returns an understandable error without echoing rejected text", () => {
    const secretSource = `do-not-return-${"가".repeat(3_001)}`;
    const parsed = translationInputSchema.safeParse({ sourceText: secretSource });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const safe = toSafeError(parsed.error);
      expect(safe.status).toBe(400);
      expect(safe.body.error.code).toBe("INVALID_INPUT");
      expect(safe.body.error.fields?.sourceText).toContain(
        "번역할 문장: 3,000자 이내로 입력해 주세요.",
      );
      expect(JSON.stringify(safe.body)).not.toContain(secretSource);
    }
  });

  it("does not expose unknown exception details", () => {
    const safe = toSafeError(new Error("OPENAI_API_KEY=super-secret-value"));

    expect(safe.status).toBe(500);
    expect(JSON.stringify(safe.body)).not.toContain("super-secret-value");
  });
});
