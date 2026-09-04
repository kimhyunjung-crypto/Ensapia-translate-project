// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import type OpenAI from "openai";
import { GeminiTranslationProvider } from "@/modules/ai/gemini-provider";
import { OpenAiTranslationProvider } from "@/modules/ai/openai-provider";
import type { DraftProviderRequest } from "@/modules/ai/types";

const request: DraftProviderRequest = {
  modelId: "configured-model",
  systemInstruction: "configured instruction",
  prompt: "structured prompt",
  condition: {
    sourceText: "확인 부탁드립니다.",
    direction: "ko-ja",
    rules: [],
  },
};

describe("EPIC 5 provider adapters", () => {
  it("uses the OpenAI Responses API with storage disabled and parsed output", async () => {
    const parse = vi.fn(async () => ({
      output_parsed: { translatedText: "ご確認をお願いいたします。" },
      usage: { input_tokens: 12, output_tokens: 8 },
    }));
    const client = { responses: { parse } } as unknown as Pick<OpenAI, "responses">;
    const provider = new OpenAiTranslationProvider(undefined, client);
    const result = await provider.translate(request);

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "configured-model",
        instructions: "configured instruction",
        input: "structured prompt",
        store: false,
        text: { format: expect.objectContaining({ type: "json_schema", strict: true }) },
      }),
    );
    expect(result.data.translatedText).toBe("ご確認をお願いいたします。");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
  });

  it("uses the Gemini Interactions API with storage disabled and a JSON schema", async () => {
    const create = vi.fn(async () => ({
      status: "completed",
      output_text: JSON.stringify({ translatedText: "ご確認をお願いいたします。" }),
      usage: { total_input_tokens: 11, total_output_tokens: 7 },
    }));
    const client = { interactions: { create } } as unknown as Pick<GoogleGenAI, "interactions">;
    const provider = new GeminiTranslationProvider(undefined, client);
    const result = await provider.translate(request);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "configured-model",
        system_instruction: "configured instruction",
        input: "structured prompt",
        store: false,
        generation_config: { thinking_level: "low" },
        response_format: expect.objectContaining({
          type: "text",
          mime_type: "application/json",
          schema: expect.objectContaining({ type: "object" }),
        }),
      }),
    );
    expect(result.data.translatedText).toBe("ご確認をお願いいたします。");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });
});
