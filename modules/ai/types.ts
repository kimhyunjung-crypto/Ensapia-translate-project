import type { DraftOutput, FinalOutput, ReviewOutput } from "@/modules/ai/schemas";
import type { FirstPassProviderInput } from "@/modules/translation/provider-inputs";

export type AiProviderName = "openai" | "gemini";
export type AiStage = "draft" | "review" | "final";

export type StageConfiguration = {
  provider: AiProviderName;
  stage: AiStage;
  modelId: string;
  promptVersionId: string;
  systemInstruction: string;
};

export type PipelineConfiguration = {
  openaiDraft: StageConfiguration;
  geminiDraft: StageConfiguration;
  openaiReview: StageConfiguration;
  geminiReview: StageConfiguration;
  openaiFinal: StageConfiguration;
};

type BaseProviderRequest = {
  modelId: string;
  systemInstruction: string;
  prompt: string;
};

export type DraftProviderRequest = BaseProviderRequest & {
  condition: FirstPassProviderInput;
};

export type ReviewProviderRequest = BaseProviderRequest & {
  condition: FirstPassProviderInput;
  candidateProvider: AiProviderName;
  candidateText: string;
};

export type FinalProviderRequest = BaseProviderRequest & {
  condition: FirstPassProviderInput;
  drafts: Record<AiProviderName, DraftOutput>;
  reviews: Record<AiProviderName, ReviewOutput>;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ProviderCallResult<T> = {
  data: T;
  usage: TokenUsage;
  startedAt: number;
  completedAt: number;
};

export interface TranslationProvider {
  readonly provider: AiProviderName;
  translate(request: DraftProviderRequest): Promise<ProviderCallResult<DraftOutput>>;
  review(request: ReviewProviderRequest): Promise<ProviderCallResult<ReviewOutput>>;
  synthesize?(request: FinalProviderRequest): Promise<ProviderCallResult<FinalOutput>>;
}
