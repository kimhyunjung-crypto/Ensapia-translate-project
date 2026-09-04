import { AppError } from "@/lib/errors";
import type { AiProviderName, AiStage } from "@/modules/ai/types";

const PROVIDER_LABELS: Record<AiProviderName, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

const STAGE_LABELS: Record<AiStage, string> = {
  draft: "1차 번역",
  review: "교차검토",
  final: "최종 종합",
};

export class AiProviderError extends AppError {
  constructor(provider: AiProviderName, stage: AiStage, cause?: unknown) {
    super(
      "AI_PROVIDER_FAILED",
      `${PROVIDER_LABELS[provider]} ${STAGE_LABELS[stage]} 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.`,
      502,
    );
    this.name = "AiProviderError";
    this.cause = cause;
  }
}
