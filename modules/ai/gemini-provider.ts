import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AiProviderError } from "@/modules/ai/errors";
import {
  draftOutputSchema,
  reviewOutputSchema,
  type DraftOutput,
  type ReviewOutput,
} from "@/modules/ai/schemas";
import type {
  AiStage,
  DraftProviderRequest,
  ProviderCallResult,
  ReviewProviderRequest,
  TranslationProvider,
} from "@/modules/ai/types";

export class GeminiTranslationProvider implements TranslationProvider {
  readonly provider = "gemini" as const;
  private readonly client: Pick<GoogleGenAI, "interactions">;

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    client?: Pick<GoogleGenAI, "interactions">,
  ) {
    if (client) {
      this.client = client;
      return;
    }
    if (!apiKey?.trim()) throw new AiProviderError("gemini", "draft");
    this.client = new GoogleGenAI({ apiKey });
  }

  translate(request: DraftProviderRequest): Promise<ProviderCallResult<DraftOutput>> {
    return this.invoke(request, "draft", draftOutputSchema);
  }

  review(request: ReviewProviderRequest): Promise<ProviderCallResult<ReviewOutput>> {
    return this.invoke(request, "review", reviewOutputSchema);
  }

  private async invoke<T>(
    request: { modelId: string; systemInstruction: string; prompt: string },
    stage: AiStage,
    schema: z.ZodType<T>,
  ): Promise<ProviderCallResult<T>> {
    const startedAt = Date.now();

    try {
      const interaction = await this.client.interactions.create({
        model: request.modelId,
        system_instruction: request.systemInstruction,
        input: request.prompt,
        store: false,
        generation_config: { thinking_level: "low" },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: z.toJSONSchema(schema, { target: "draft-7" }),
        },
      });

      if (interaction.status !== "completed" || !interaction.output_text) {
        throw new Error(`Gemini interaction status: ${interaction.status}`);
      }

      return {
        data: schema.parse(JSON.parse(interaction.output_text)),
        usage: {
          inputTokens: interaction.usage?.total_input_tokens ?? 0,
          outputTokens: interaction.usage?.total_output_tokens ?? 0,
        },
        startedAt,
        completedAt: Date.now(),
      };
    } catch (error) {
      throw new AiProviderError("gemini", stage, error);
    }
  }
}
