import { z } from "zod";

export const draftOutputSchema = z.object({
  translatedText: z.string().min(1),
});

const reviewCheckSchema = z.object({
  passed: z.boolean(),
  notes: z.array(z.string()),
});

export const reviewOutputSchema = z.object({
  improvedText: z.string().min(1),
  checks: z.object({
    mistranslation: reviewCheckSchema,
    omissions: reviewCheckSchema,
    terminology: reviewCheckSchema,
    tone: reviewCheckSchema,
    untranslated: reviewCheckSchema,
    naturalness: reviewCheckSchema,
  }),
});

export const finalOutputSchema = z.object({
  finalText: z.string().min(1),
});

export type DraftOutput = z.infer<typeof draftOutputSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type FinalOutput = z.infer<typeof finalOutputSchema>;
