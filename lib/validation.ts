import { z } from "zod";

const normalizedRequiredText = (label: string, maximum: number) =>
  z
    .string({ error: `${label}: 글자 형식이어야 합니다.` })
    .trim()
    .min(1, `${label}: 내용을 입력해 주세요.`)
    .max(maximum, `${label}: ${maximum.toLocaleString("ko-KR")}자 이내로 입력해 주세요.`);

export const translationInputSchema = z.object({
  sourceText: normalizedRequiredText("번역할 문장", 3_000),
});

export const glossaryInputSchema = z.object({
  sourceText: normalizedRequiredText("원어", 200),
  targetText: normalizedRequiredText("권장 표기", 200),
  direction: z.enum(["ko-ja", "ja-ko"], {
    error: "번역 방향은 한국어→일본어 또는 일본어→한국어여야 합니다.",
  }),
  description: z.string().trim().max(1_000, "설명은 1,000자 이하여야 합니다.").optional(),
  forbiddenTerms: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
});

export const personInputSchema = z.object({
  japaneseCanonical: normalizedRequiredText("일본어 통합 표기", 200),
  koreanCanonical: normalizedRequiredText("한국어 통합 표기", 200),
  aliases: z.array(normalizedRequiredText("인식 표현", 200)).min(1).max(30),
});

export const toneRuleInputSchema = z.object({
  situation: normalizedRequiredText("상황", 100),
  recommendedTone: normalizedRequiredText("권장 어조", 1_000),
  cushionPhrases: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  forbiddenPhrases: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  example: z.string().trim().max(3_000, "예문은 3,000자 이하여야 합니다.").optional(),
});

export type TranslationInput = z.infer<typeof translationInputSchema>;
export type GlossaryInput = z.infer<typeof glossaryInputSchema>;
export type PersonInput = z.infer<typeof personInputSchema>;
export type ToneRuleInput = z.infer<typeof toneRuleInputSchema>;
