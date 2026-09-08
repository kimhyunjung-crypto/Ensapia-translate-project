import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/database";
import type {
  AiProviderName,
  AiStage,
  PipelineConfiguration,
  StageConfiguration,
} from "@/modules/ai/types";

export type ConfigurationKey = keyof PipelineConfiguration;

export const REQUIRED_STAGES: ReadonlyArray<{
  key: ConfigurationKey;
  provider: AiProviderName;
  stage: AiStage;
}> = [
  { key: "openaiDraft", provider: "openai", stage: "draft" },
  { key: "geminiDraft", provider: "gemini", stage: "draft" },
  { key: "openaiReview", provider: "openai", stage: "review" },
  { key: "geminiReview", provider: "gemini", stage: "review" },
  { key: "openaiFinal", provider: "openai", stage: "final" },
];

async function loadStage(
  client: PrismaClient,
  provider: AiProviderName,
  stage: AiStage,
  now: Date,
): Promise<StageConfiguration> {
  const [model, prompt] = await Promise.all([
    client.modelConfig.findFirst({
      where: { provider, stage, isActive: true, effectiveFrom: { lte: now } },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    }),
    client.promptVersion.findFirst({
      where: { provider, stage, isActive: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!model || !prompt) {
    throw new AppError(
      "AI_CONFIGURATION_MISSING",
      "AI 모델 또는 지시문 설정이 준비되지 않았습니다.",
      500,
    );
  }

  return {
    provider,
    stage,
    modelId: model.modelId,
    promptVersionId: prompt.id,
    systemInstruction: prompt.template,
  };
}

export async function loadPipelineConfiguration(
  client: PrismaClient = prisma,
  now = new Date(),
): Promise<PipelineConfiguration> {
  const entries = await Promise.all(
    REQUIRED_STAGES.map(async ({ key, provider, stage }) => [
      key,
      await loadStage(client, provider, stage, now),
    ] as const),
  );

  return Object.fromEntries(entries) as PipelineConfiguration;
}
