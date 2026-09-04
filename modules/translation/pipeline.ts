import { AppError } from "@/lib/errors";
import type { DraftOutput, FinalOutput, ReviewOutput } from "@/modules/ai/schemas";
import type {
  AiProviderName,
  AiStage,
  PipelineConfiguration,
  ProviderCallResult,
  TranslationProvider,
} from "@/modules/ai/types";
import { assertTranslationQuality, type QualityCheck } from "@/modules/translation/quality";
import {
  buildDraftPrompt,
  buildFinalPrompt,
  buildReviewPrompt,
} from "@/modules/translation/prompts";
import type { FirstPassProviderRequests } from "@/modules/translation/provider-inputs";

export type ExecutedCall<T> = ProviderCallResult<T> & {
  provider: AiProviderName;
  stage: AiStage;
  modelId: string;
  promptVersionId: string;
  attempt: number;
};

export type TranslationPipelineResult = {
  finalText: string;
  drafts: {
    openai: ExecutedCall<DraftOutput>;
    gemini: ExecutedCall<DraftOutput>;
  };
  reviews: {
    openai: ExecutedCall<ReviewOutput>;
    gemini: ExecutedCall<ReviewOutput>;
  };
  final: ExecutedCall<FinalOutput>;
  quality: QualityCheck;
};

type PipelineProviders = {
  openai: TranslationProvider;
  gemini: TranslationProvider;
};

async function withSingleRetry<T>(
  run: () => Promise<ProviderCallResult<T>>,
  metadata: Omit<ExecutedCall<T>, keyof ProviderCallResult<T> | "attempt">,
): Promise<ExecutedCall<T>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { ...(await run()), ...metadata, attempt };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function metadata(configuration: PipelineConfiguration[keyof PipelineConfiguration]) {
  return {
    provider: configuration.provider,
    stage: configuration.stage,
    modelId: configuration.modelId,
    promptVersionId: configuration.promptVersionId,
  };
}

export async function executeTranslationPipeline(input: {
  requests: FirstPassProviderRequests;
  providers: PipelineProviders;
  configuration: PipelineConfiguration;
}): Promise<TranslationPipelineResult> {
  const { requests, providers, configuration } = input;
  const [openaiDraft, geminiDraft] = await Promise.all([
    withSingleRetry(
      () =>
        providers.openai.translate({
          condition: requests.openai.input,
          modelId: configuration.openaiDraft.modelId,
          systemInstruction: configuration.openaiDraft.systemInstruction,
          prompt: buildDraftPrompt(requests.openai.input),
        }),
      metadata(configuration.openaiDraft),
    ),
    withSingleRetry(
      () =>
        providers.gemini.translate({
          condition: requests.gemini.input,
          modelId: configuration.geminiDraft.modelId,
          systemInstruction: configuration.geminiDraft.systemInstruction,
          prompt: buildDraftPrompt(requests.gemini.input),
        }),
      metadata(configuration.geminiDraft),
    ),
  ]);

  const [openaiReview, geminiReview] = await Promise.all([
    withSingleRetry(
      () => {
        const review = {
          condition: requests.openai.input,
          candidateProvider: "gemini" as const,
          candidateText: geminiDraft.data.translatedText,
        };
        return providers.openai.review({
          ...review,
          modelId: configuration.openaiReview.modelId,
          systemInstruction: configuration.openaiReview.systemInstruction,
          prompt: buildReviewPrompt(review),
        });
      },
      metadata(configuration.openaiReview),
    ),
    withSingleRetry(
      () => {
        const review = {
          condition: requests.gemini.input,
          candidateProvider: "openai" as const,
          candidateText: openaiDraft.data.translatedText,
        };
        return providers.gemini.review({
          ...review,
          modelId: configuration.geminiReview.modelId,
          systemInstruction: configuration.geminiReview.systemInstruction,
          prompt: buildReviewPrompt(review),
        });
      },
      metadata(configuration.geminiReview),
    ),
  ]);

  if (!providers.openai.synthesize) {
    throw new AppError("AI_CONFIGURATION_MISSING", "최종 종합 모델 설정을 확인해 주세요.", 500);
  }

  const finalInput = {
    condition: requests.openai.input,
    drafts: { openai: openaiDraft.data, gemini: geminiDraft.data },
    reviews: { openai: openaiReview.data, gemini: geminiReview.data },
  };
  const final = await withSingleRetry(
    () =>
      providers.openai.synthesize!({
        ...finalInput,
        modelId: configuration.openaiFinal.modelId,
        systemInstruction: configuration.openaiFinal.systemInstruction,
        prompt: buildFinalPrompt(finalInput),
      }),
    metadata(configuration.openaiFinal),
  );
  const quality = assertTranslationQuality(requests.openai.input, final.data.finalText);

  return {
    finalText: final.data.finalText,
    drafts: { openai: openaiDraft, gemini: geminiDraft },
    reviews: { openai: openaiReview, gemini: geminiReview },
    final,
    quality,
  };
}
