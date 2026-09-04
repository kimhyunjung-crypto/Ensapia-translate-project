import {
  type DraftOutput,
  type FinalOutput,
  type ReviewOutput,
} from "@/modules/ai/schemas";
import type {
  AiProviderName,
  DraftProviderRequest,
  FinalProviderRequest,
  ProviderCallResult,
  ReviewProviderRequest,
  TranslationProvider,
} from "@/modules/ai/types";
import { createDemoTranslation } from "@/modules/translation/demo-service";

const DEMO_DELAY_MS = 8;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(Array.from(text).length / 4));
}

function sourceNumbers(sourceText: string): string[] {
  return sourceText.normalize("NFKC").match(/\d+(?:[.,]\d+)*/g) ?? [];
}

function withRequiredContent(request: DraftProviderRequest, translatedText: string): string {
  const additions: string[] = [];

  for (const rule of request.condition.rules) {
    if (rule.type !== "tone" && !translatedText.includes(rule.requiredText)) {
      additions.push(rule.requiredText);
    }
  }

  for (const number of sourceNumbers(request.condition.sourceText)) {
    if (!translatedText.normalize("NFKC").includes(number) && !additions.includes(number)) {
      additions.push(number);
    }
  }

  return additions.length > 0 ? `${translatedText} ${additions.join(" ")}` : translatedText;
}

function passingReview(improvedText: string): ReviewOutput {
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

export class DemoTranslationProvider implements TranslationProvider {
  constructor(readonly provider: AiProviderName) {}

  async translate(request: DraftProviderRequest): Promise<ProviderCallResult<DraftOutput>> {
    const startedAt = Date.now();
    await wait(DEMO_DELAY_MS);
    const demo = createDemoTranslation(request.condition.sourceText);
    const translatedText = withRequiredContent(request, demo.finalText);

    return {
      data: { translatedText },
      usage: {
        inputTokens: estimateTokens(request.prompt),
        outputTokens: estimateTokens(translatedText),
      },
      startedAt,
      completedAt: Date.now(),
    };
  }

  async review(request: ReviewProviderRequest): Promise<ProviderCallResult<ReviewOutput>> {
    const startedAt = Date.now();
    await wait(DEMO_DELAY_MS);

    return {
      data: passingReview(request.candidateText),
      usage: {
        inputTokens: estimateTokens(request.prompt),
        outputTokens: estimateTokens(request.candidateText),
      },
      startedAt,
      completedAt: Date.now(),
    };
  }

  async synthesize(request: FinalProviderRequest): Promise<ProviderCallResult<FinalOutput>> {
    const startedAt = Date.now();
    await wait(DEMO_DELAY_MS);
    const finalText = request.reviews.openai.improvedText;

    return {
      data: { finalText },
      usage: {
        inputTokens: estimateTokens(request.prompt),
        outputTokens: estimateTokens(finalText),
      },
      startedAt,
      completedAt: Date.now(),
    };
  }
}

export function createDemoProviders(): {
  openai: TranslationProvider;
  gemini: TranslationProvider;
} {
  return {
    openai: new DemoTranslationProvider("openai"),
    gemini: new DemoTranslationProvider("gemini"),
  };
}
