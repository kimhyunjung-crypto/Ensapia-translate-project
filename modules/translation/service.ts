import type { PrismaClient } from "@prisma/client";
import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError } from "@/lib/errors";
import { getEnvironmentStatus } from "@/lib/environment";
import { detectTranslationDirection } from "@/lib/language";
import { loadPipelineConfiguration } from "@/modules/ai/configuration";
import { createDemoProviders } from "@/modules/ai/demo-provider";
import { GeminiTranslationProvider } from "@/modules/ai/gemini-provider";
import { OpenAiTranslationProvider } from "@/modules/ai/openai-provider";
import type {
  PipelineConfiguration,
  TranslationProvider,
} from "@/modules/ai/types";
import {
  executeTranslationPipeline,
  TranslationPipelineFailure,
} from "@/modules/translation/pipeline";
import {
  saveCompletedPipeline,
  saveFailedPipeline,
  type CompletedPipelinePersistenceInput,
} from "@/modules/translation/pipeline-repository";
import { prepareFirstPassProviderRequests } from "@/modules/translation/provider-inputs";
import {
  clearPendingTranslationSave,
  readPendingTranslationSave,
  registerPendingTranslationSave,
} from "@/modules/translation/recovery-store";

type DataMode = "demo" | "real";

type ProviderPair = {
  openai: TranslationProvider;
  gemini: TranslationProvider;
};

export type TranslationServiceOptions = {
  client?: PrismaClient;
  key?: Buffer;
  mode?: DataMode;
  providers?: ProviderPair;
  configuration?: PipelineConfiguration;
  persistCompleted?: (input: CompletedPipelinePersistenceInput) => Promise<string>;
  persistFailed?: typeof saveFailedPipeline;
};

export type CompletedTranslation = {
  direction: "ko-ja" | "ja-ko";
  sourceLanguage: "ko" | "ja";
  targetLanguage: "ko" | "ja";
  finalText: string;
  demo: boolean;
};

export class TranslationSaveError extends AppError {
  constructor(
    public readonly recoveryId: string,
    cause?: unknown,
  ) {
    super(
      "TRANSLATION_SAVE_FAILED",
      "번역은 완료했지만 기록을 저장하지 못했습니다. AI를 다시 호출하지 않고 저장만 다시 시도해 주세요.",
      503,
    );
    this.name = "TranslationSaveError";
    this.cause = cause;
  }
}

function createRealProviders(): ProviderPair {
  return {
    openai: new OpenAiTranslationProvider(),
    gemini: new GeminiTranslationProvider(),
  };
}

export async function executeTranslation(
  sourceText: string,
  options: TranslationServiceOptions = {},
): Promise<CompletedTranslation> {
  const detection = detectTranslationDirection(sourceText);
  if (!detection.direction || !detection.sourceLanguage || !detection.targetLanguage) {
    throw new AppError(
      "UNSUPPORTED_LANGUAGE",
      "한국어 또는 일본어가 포함된 메시지를 입력해 주세요.",
    );
  }

  const client = options.client ?? prisma;
  const key = options.key ?? decodeEncryptionKey();
  const mode = options.mode ?? getEnvironmentStatus().dataMode;
  const [requests, configuration] = await Promise.all([
    prepareFirstPassProviderRequests(sourceText, detection.direction, client, key),
    options.configuration ?? loadPipelineConfiguration(client),
  ]);
  const providers = options.providers ?? (mode === "demo" ? createDemoProviders() : createRealProviders());
  let result: Awaited<ReturnType<typeof executeTranslationPipeline>>;
  try {
    result = await executeTranslationPipeline({ requests, providers, configuration });
  } catch (error) {
    if (error instanceof TranslationPipelineFailure) {
      try {
        await (options.persistFailed ?? saveFailedPipeline)({
          client,
          key,
          condition: requests.openai.input,
          sourceLanguage: detection.sourceLanguage,
          targetLanguage: detection.targetLanguage,
          configuration,
          failure: error,
        });
      } catch {
        throw new AppError(
          "TRANSLATION_AND_LOG_SAVE_FAILED",
          "번역 단계와 실패 기록 저장이 모두 완료되지 않았습니다. 원문을 유지한 채 다시 시도해 주세요.",
          503,
        );
      }
    }
    throw error;
  }

  const persistenceInput: CompletedPipelinePersistenceInput = {
    client,
    key,
    condition: requests.openai.input,
    sourceLanguage: detection.sourceLanguage,
    targetLanguage: detection.targetLanguage,
    configuration,
    result,
  };

  try {
    await (options.persistCompleted ?? saveCompletedPipeline)(persistenceInput);
  } catch (error) {
    const recoveryId = registerPendingTranslationSave(
      {
        condition: persistenceInput.condition,
        sourceLanguage: persistenceInput.sourceLanguage,
        targetLanguage: persistenceInput.targetLanguage,
        configuration: persistenceInput.configuration,
        result: persistenceInput.result,
        demo: mode === "demo",
      },
      key,
    );
    throw new TranslationSaveError(recoveryId, error);
  }

  return {
    direction: detection.direction,
    sourceLanguage: detection.sourceLanguage,
    targetLanguage: detection.targetLanguage,
    finalText: result.finalText,
    demo: mode === "demo",
  };
}

export async function retryTranslationSave(
  recoveryId: string,
  options: Pick<TranslationServiceOptions, "client" | "key" | "persistCompleted"> = {},
): Promise<CompletedTranslation> {
  const client = options.client ?? prisma;
  const key = options.key ?? decodeEncryptionKey();
  const pending = readPendingTranslationSave(recoveryId, key);

  try {
    await (options.persistCompleted ?? saveCompletedPipeline)({
      client,
      key,
      condition: pending.condition,
      sourceLanguage: pending.sourceLanguage,
      targetLanguage: pending.targetLanguage,
      configuration: pending.configuration,
      result: pending.result,
    });
  } catch (error) {
    throw new TranslationSaveError(recoveryId, error);
  }

  clearPendingTranslationSave(recoveryId);
  return {
    direction: pending.condition.direction,
    sourceLanguage: pending.sourceLanguage,
    targetLanguage: pending.targetLanguage,
    finalText: pending.result.finalText,
    demo: pending.demo,
  };
}
