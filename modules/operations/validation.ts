import { z } from "zod";
import { isValidDateOnly, seoulDateRange } from "@/modules/operations/dates";

const dateOnly = z.string().refine(isValidDateOnly, "올바른 날짜를 입력해 주세요.");

export const deletionRangeSchema = z
  .object({ dateFrom: dateOnly, dateTo: dateOnly })
  .superRefine((value, context) => {
    if (!isValidDateOnly(value.dateFrom) || !isValidDateOnly(value.dateTo)) return;
    try {
      seoulDateRange(value.dateFrom, value.dateTo);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "종료일은 시작일보다 빠를 수 없습니다.",
      });
    }
  });

export const confirmedDeletionSchema = deletionRangeSchema.and(
  z.object({ confirmedCount: z.number().int().nonnegative() }),
);

export const costPolicySchema = z.object({
  monthlyLimitUsd: z
    .number({ error: "월 비용 한도를 숫자로 입력해 주세요." })
    .min(0.01, "월 비용 한도는 $0.01 이상이어야 합니다.")
    .max(100_000, "월 비용 한도는 $100,000 이하여야 합니다."),
});

export const modelConfigurationInputSchema = z.object({
  provider: z.enum(["openai", "gemini"]),
  stage: z.enum(["draft", "review", "final"]),
  modelId: z.string().trim().min(1, "모델 ID를 입력해 주세요.").max(200),
});

export const modelConfigurationsSchema = z.object({
  configurations: z.array(modelConfigurationInputSchema).min(1).max(5),
});

export type ModelConfigurationInput = z.infer<typeof modelConfigurationInputSchema>;
