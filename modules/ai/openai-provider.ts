import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { AiProviderError } from "@/modules/ai/errors";
import {
  draftOutputSchema,
  finalOutputSchema,
  reviewOutputSchema,
  type DraftOutput,
  type FinalOutput,
  type ReviewOutput,
} from "@/modules/ai/schemas";
import type {
  AiStage,
  DraftProviderRequest,
  FinalProviderRequest,
  ProviderCallResult,
  ReviewProviderRequest,
  TranslationProvider,
} from "@/modules/ai/types";

export class OpenAiTranslationProvider implements TranslationProvider {
  readonly provider = "openai" as const;
  private readonly client: Pick<OpenAI, "responses">;

  constructor(
    apiKey = process.env.OPENAI_API_KEY,
    client?: Pick<OpenAI, "responses">,
  ) {
    if (client) {
      this.client = client;
      return;
    }
    if (!apiKey?.trim()) throw new AiProviderError("openai", "draft");
    this.client = new OpenAI({ apiKey });
  }

  translate(request: DraftProviderRequest): Promise<ProviderCallResult<DraftOutput>> {
    return this.invoke(request, "draft", draftOutputSchema, "ensapia_draft");
  }

  review(request: ReviewProviderRequest): Promise<ProviderCallResult<ReviewOutput>> {
    return this.invoke(request, "review", reviewOutputSchema, "ensapia_review");
  }

  synthesize(request: FinalProviderRequest): Promise<ProviderCallResult<FinalOutput>> {
    return this.invoke(request, "final", finalOutputSchema, "ensapia_final");
  }

  private async invoke<T>(
    request: { modelId: string; systemInstruction: string; prompt: string },
    stage: AiStage,
    schema: z.ZodType<T>,
    schemaName: string,
  ): Promise<ProviderCallResult<T>> {
    const startedAt = Date.now();

    try {
      const response = await this.client.responses.parse({
        model: request.modelId,
        instructions: request.systemInstruction,
        input: request.prompt,
        store: false,
        text: { format: zodTextFormat(schema, schemaName) },
      });
      const data = schema.parse(response.output_parsed);

      return {
        data,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        startedAt,
        completedAt: Date.now(),
      };
    } catch (error) {
      throw new AiProviderError("openai", stage, error);
    }
  }
}
