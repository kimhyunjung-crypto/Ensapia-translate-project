// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DraftOutput, FinalOutput, ReviewOutput } from "@/modules/ai/schemas";
import type {
  AiProviderName,
  AiStage,
  FinalProviderRequest,
  PipelineConfiguration,
  ProviderCallResult,
  ReviewProviderRequest,
  TranslationProvider,
} from "@/modules/ai/types";
import { executeTranslationPipeline } from "@/modules/translation/pipeline";
import { createFirstPassProviderRequests } from "@/modules/translation/provider-inputs";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const configuration: PipelineConfiguration = {
  openaiDraft: stage("openai", "draft"),
  geminiDraft: stage("gemini", "draft"),
  openaiReview: stage("openai", "review"),
  geminiReview: stage("gemini", "review"),
  openaiFinal: stage("openai", "final"),
};

const requests = createFirstPassProviderRequests({
  sourceText: "요청 번호는 2026입니다.",
  direction: "ko-ja",
  rules: [],
});

function stage(provider: AiProviderName, aiStage: AiStage) {
  return {
    provider,
    stage: aiStage,
    modelId: `${provider}-${aiStage}-model`,
    promptVersionId: `${provider}-${aiStage}-prompt`,
    systemInstruction: `${aiStage} instruction`,
  };
}

function reviewResult(improvedText: string): ReviewOutput {
  const passed = { passed: true, notes: [] as string[] };
  return {
    improvedText,
    checks: {
      mistranslation: { ...passed },
      omissions: { ...passed },
      terminology: { ...passed },
      tone: { ...passed },
      untranslated: { ...passed },
      naturalness: { ...passed },
    },
  };
}

class RecordingProvider implements TranslationProvider {
  private readonly attempts = new Map<AiStage, number>();
  readonly reviewedCandidates: string[] = [];
  finalRequest?: FinalProviderRequest;

  constructor(
    readonly provider: AiProviderName,
    private readonly options: { failOnce?: AiStage; finalText?: string } = {},
  ) {}

  count(stageName: AiStage): number {
    return this.attempts.get(stageName) ?? 0;
  }

  translate(): Promise<ProviderCallResult<DraftOutput>> {
    const translatedText =
      this.provider === "openai" ? "依頼番号は2026です。" : "依頼番号2026をご確認ください。";
    return this.respond("draft", { translatedText });
  }

  review(request: ReviewProviderRequest): Promise<ProviderCallResult<ReviewOutput>> {
    this.reviewedCandidates.push(request.candidateText);
    return this.respond("review", reviewResult(request.candidateText));
  }

  synthesize(request: FinalProviderRequest): Promise<ProviderCallResult<FinalOutput>> {
    this.finalRequest = request;
    return this.respond("final", {
      finalText: this.options.finalText ?? "依頼番号は2026です。",
    });
  }

  private async respond<T>(stageName: AiStage, data: T): Promise<ProviderCallResult<T>> {
    const attempt = this.count(stageName) + 1;
    this.attempts.set(stageName, attempt);
    const startedAt = Date.now();

    if (this.options.failOnce === stageName && attempt === 1) {
      await wait(2);
      throw new Error("temporary fake failure");
    }

    await wait(20);
    return {
      data,
      usage: { inputTokens: 10, outputTokens: 5 },
      startedAt,
      completedAt: Date.now(),
    };
  }
}

function overlaps(
  left: { startedAt: number; completedAt: number },
  right: { startedAt: number; completedAt: number },
): boolean {
  return left.startedAt < right.completedAt && right.startedAt < left.completedAt;
}

describe("EPIC 5 dual-AI pipeline", () => {
  it("runs draft and cross-review stages in parallel and crosses provider results", async () => {
    const openai = new RecordingProvider("openai");
    const gemini = new RecordingProvider("gemini");
    const result = await executeTranslationPipeline({
      requests,
      configuration,
      providers: { openai, gemini },
    });

    expect(overlaps(result.drafts.openai, result.drafts.gemini)).toBe(true);
    expect(overlaps(result.reviews.openai, result.reviews.gemini)).toBe(true);
    expect(openai.reviewedCandidates).toEqual([result.drafts.gemini.data.translatedText]);
    expect(gemini.reviewedCandidates).toEqual([result.drafts.openai.data.translatedText]);
    expect(Object.keys(result.reviews.openai.data.checks)).toEqual([
      "mistranslation",
      "omissions",
      "terminology",
      "tone",
      "untranslated",
      "naturalness",
    ]);
    expect(openai.finalRequest?.drafts).toEqual({
      openai: result.drafts.openai.data,
      gemini: result.drafts.gemini.data,
    });
    expect(result.finalText).toBe("依頼番号は2026です。");
  });

  it("retries only the failed stage once", async () => {
    const openai = new RecordingProvider("openai", { failOnce: "draft" });
    const gemini = new RecordingProvider("gemini");
    const result = await executeTranslationPipeline({
      requests,
      configuration,
      providers: { openai, gemini },
    });

    expect(result.drafts.openai.attempt).toBe(2);
    expect(result.drafts.gemini.attempt).toBe(1);
    expect(openai.count("draft")).toBe(2);
    expect(gemini.count("draft")).toBe(1);
    expect(openai.count("review")).toBe(1);
    expect(gemini.count("review")).toBe(1);
  });

  it("does not report success when the final quality check fails", async () => {
    const openai = new RecordingProvider("openai", {
      finalText: "요청 번호는 2026입니다.",
    });
    const gemini = new RecordingProvider("gemini");

    await expect(
      executeTranslationPipeline({
        requests,
        configuration,
        providers: { openai, gemini },
      }),
    ).rejects.toMatchObject({ code: "WRONG_TARGET_LANGUAGE", status: 422 });
  });
});
