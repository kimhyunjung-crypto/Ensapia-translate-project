import { AppError } from "@/lib/errors";
import type { DraftOutput, FinalOutput, ReviewOutput } from "@/modules/ai/schemas";
import type {
  AiProviderName,
  AiStage,
  PipelineConfiguration,
  ProviderCallResult,
  TranslationProvider,
} from "@/modules/ai/types";
import { enforceOpeningGreeting } from "@/modules/rules/opening-greeting";
import { assertTranslationQuality, type QualityCheck } from "@/modules/translation/quality";
import {
  buildDraftPrompt,
  buildFinalPrompt,
  buildReviewPrompt,
  hardenSystemInstruction,
} from "@/modules/translation/prompts";
import type { FirstPassProviderRequests } from "@/modules/translation/provider-inputs";

export type ExecutedCall<T> = ProviderCallResult<T> & {
  provider: AiProviderName;
  stage: AiStage;
  modelId: string;
  promptVersionId: string;
  attempt: number;
};

export type PipelineAttemptRecord = {
  provider: AiProviderName;
  stage: AiStage;
  modelId: string;
  promptVersionId: string;
  attempt: number;
  status: "completed" | "failed";
  startedAt: number;
  completedAt: number;
  outputText?: string;
  usage?: ProviderCallResult<unknown>["usage"];
  errorCode?: string;
  safeMessage?: string;
};

export class TranslationPipelineFailure extends AppError {
  constructor(
    causeError: unknown,
    public readonly attempts: PipelineAttemptRecord[],
  ) {
    const safe = causeError instanceof AppError
      ? causeError
      : new AppError(
          "AI_PIPELINE_FAILED",
          "번역 단계 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          502,
        );
    super(safe.code, safe.message, safe.status);
    this.name = "TranslationPipelineFailure";
    this.cause = causeError;
  }
}

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
  attempts: PipelineAttemptRecord[];
};

type PipelineProviders = {
  openai: TranslationProvider;
  gemini: TranslationProvider;
};

async function withSingleRetry<T>(
  run: () => Promise<ProviderCallResult<T>>,
  metadata: Omit<ExecutedCall<T>, keyof ProviderCallResult<T> | "attempt">,
  serialize: (data: T) => string,
  attempts: PipelineAttemptRecord[],
): Promise<ExecutedCall<T>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const fallbackStartedAt = Date.now();
    try {
      const result = await run();
      attempts.push({
        ...metadata,
        attempt,
        status: "completed",
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        outputText: serialize(result.data),
        usage: result.usage,
      });
      return { ...result, ...metadata, attempt };
    } catch (error) {
      lastError = error;
      attempts.push({
        ...metadata,
        attempt,
        status: "failed",
        startedAt: fallbackStartedAt,
        completedAt: Date.now(),
        errorCode: error instanceof AppError ? error.code : "AI_CALL_FAILED",
        safeMessage: error instanceof AppError
          ? error.message
          : "AI 단계 실행에 실패했습니다.",
      });
    }
  }

  throw lastError;
}

async function settleBoth<A, B>(left: Promise<A>, right: Promise<B>): Promise<[A, B]> {
  const [leftResult, rightResult] = await Promise.allSettled([left, right]);
  if (leftResult.status === "rejected") throw leftResult.reason;
  if (rightResult.status === "rejected") throw rightResult.reason;
  return [leftResult.value, rightResult.value];
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
  const attempts: PipelineAttemptRecord[] = [];

  try {
    const [openaiDraft, geminiDraft] = await settleBoth(
      withSingleRetry(
        () =>
          providers.openai.translate({
            condition: requests.openai.input,
            modelId: configuration.openaiDraft.modelId,
            systemInstruction: hardenSystemInstruction(configuration.openaiDraft.systemInstruction),
            prompt: buildDraftPrompt(requests.openai.input),
          }),
        metadata(configuration.openaiDraft),
        (data) => data.translatedText,
        attempts,
      ),
      withSingleRetry(
        () =>
          providers.gemini.translate({
            condition: requests.gemini.input,
            modelId: configuration.geminiDraft.modelId,
            systemInstruction: hardenSystemInstruction(configuration.geminiDraft.systemInstruction),
            prompt: buildDraftPrompt(requests.gemini.input),
          }),
        metadata(configuration.geminiDraft),
        (data) => data.translatedText,
        attempts,
      ),
    );

    const [openaiReview, geminiReview] = await settleBoth(
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
            systemInstruction: hardenSystemInstruction(configuration.openaiReview.systemInstruction),
            prompt: buildReviewPrompt(review),
          });
        },
        metadata(configuration.openaiReview),
        JSON.stringify,
        attempts,
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
            systemInstruction: hardenSystemInstruction(configuration.geminiReview.systemInstruction),
            prompt: buildReviewPrompt(review),
          });
        },
        metadata(configuration.geminiReview),
        JSON.stringify,
        attempts,
      ),
    );

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
          systemInstruction: hardenSystemInstruction(configuration.openaiFinal.systemInstruction),
          prompt: buildFinalPrompt(finalInput),
        }),
      metadata(configuration.openaiFinal),
      (data) => data.finalText,
      attempts,
    );
    const hasOpeningGreetingHardRule = requests.openai.input.rules.some(
      (rule) => rule.type === "hard" && rule.category === "opening_greeting",
    );
    const enforcedGreeting = hasOpeningGreetingHardRule
      ? enforceOpeningGreeting(
          requests.openai.input.sourceText,
          requests.openai.input.direction,
          final.data.finalText,
        )
      : { finalText: final.data.finalText, corrected: false };
    const enforcedFinal = enforcedGreeting.corrected
      ? { ...final, data: { ...final.data, finalText: enforcedGreeting.finalText } }
      : final;
    if (enforcedGreeting.corrected) {
      const finalAttempt = attempts.findLast(
        (attempt) => attempt.provider === "openai" &&
          attempt.stage === "final" &&
          attempt.status === "completed",
      );
      if (finalAttempt) finalAttempt.outputText = enforcedGreeting.finalText;
    }
    const quality = assertTranslationQuality(
      requests.openai.input,
      enforcedGreeting.finalText,
    );

    return {
      finalText: enforcedGreeting.finalText,
      drafts: { openai: openaiDraft, gemini: geminiDraft },
      reviews: { openai: openaiReview, gemini: geminiReview },
      final: enforcedFinal,
      quality,
      attempts,
    };
  } catch (error) {
    throw new TranslationPipelineFailure(error, attempts);
  }
}
