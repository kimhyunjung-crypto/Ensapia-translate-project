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
import { executeTranslationPipeline } from "@/modules/translation/pipeline";
import { saveCompletedPipeline } from "@/modules/translation/pipeline-repository";
import { prepareFirstPassProviderRequests } from "@/modules/translation/provider-inputs";

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
};

export type CompletedTranslation = {
  direction: "ko-ja" | "ja-ko";
  sourceLanguage: "ko" | "ja";
  targetLanguage: "ko" | "ja";
  finalText: string;
  demo: boolean;
};

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
  const result = await executeTranslationPipeline({ requests, providers, configuration });

  await saveCompletedPipeline({
    client,
    key,
    condition: requests.openai.input,
    sourceLanguage: detection.sourceLanguage,
    targetLanguage: detection.targetLanguage,
    result,
  });

  return {
    direction: detection.direction,
    sourceLanguage: detection.sourceLanguage,
    targetLanguage: detection.targetLanguage,
    finalText: result.finalText,
    demo: mode === "demo",
  };
}
