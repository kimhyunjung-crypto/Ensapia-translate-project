import type { Prisma, PrismaClient } from "@prisma/client";
import { encryptJson, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import type { AppliedRule } from "@/modules/rules/engine";
import type { ExecutedCall, TranslationPipelineResult } from "@/modules/translation/pipeline";
import type { FirstPassProviderInput } from "@/modules/translation/provider-inputs";

type PersistedCall = {
  call: ExecutedCall<unknown>;
  outputText: string;
};

function persistedCalls(result: TranslationPipelineResult): PersistedCall[] {
  return [
    { call: result.drafts.openai, outputText: result.drafts.openai.data.translatedText },
    { call: result.drafts.gemini, outputText: result.drafts.gemini.data.translatedText },
    { call: result.reviews.openai, outputText: JSON.stringify(result.reviews.openai.data) },
    { call: result.reviews.gemini, outputText: JSON.stringify(result.reviews.gemini.data) },
    { call: result.final, outputText: result.final.data.finalText },
  ];
}

async function incrementRuleUsage(
  transaction: Prisma.TransactionClient,
  rule: AppliedRule,
): Promise<void> {
  if (rule.type === "person") {
    await transaction.person.update({
      where: { id: rule.ruleId },
      data: { usedCount: { increment: 1 } },
    });
  } else if (rule.type === "glossary") {
    await transaction.glossaryTerm.update({
      where: { id: rule.ruleId },
      data: { usedCount: { increment: 1 } },
    });
  } else {
    await transaction.toneRule.update({
      where: { id: rule.ruleId },
      data: { usedCount: { increment: 1 } },
    });
  }
}

export async function saveCompletedPipeline(input: {
  client: PrismaClient;
  key: Buffer;
  condition: FirstPassProviderInput;
  sourceLanguage: "ko" | "ja";
  targetLanguage: "ko" | "ja";
  result: TranslationPipelineResult;
}): Promise<string> {
  const { client, key, condition, sourceLanguage, targetLanguage, result } = input;
  const calls = persistedCalls(result);
  const startedAt = new Date(Math.min(...calls.map(({ call }) => call.startedAt)));
  const completedAt = new Date(result.final.completedAt);
  const promptVersionIds = [...new Set(calls.map(({ call }) => call.promptVersionId))];

  return client.$transaction(async (transaction) => {
    const job = await transaction.translationJob.create({
      data: {
        sourceLanguage,
        targetLanguage,
        sourceTextEnc: encryptText(
          condition.sourceText,
          key,
          ENCRYPTION_CONTEXT.translationSource,
        ),
        finalTextEnc: encryptText(
          result.finalText,
          key,
          ENCRYPTION_CONTEXT.translationFinal,
        ),
        status: "completed",
        promptVersionIds: JSON.stringify(promptVersionIds),
        startedAt,
        completedAt,
        outputs: {
          create: calls.map(({ call, outputText }) => ({
            provider: call.provider,
            stage: call.stage,
            outputTextEnc: encryptText(outputText, key, ENCRYPTION_CONTEXT.translationOutput),
            status: "completed",
            attempt: call.attempt,
            latencyMs: Math.max(0, call.completedAt - call.startedAt),
            createdAt: new Date(call.startedAt),
          })),
        },
        ruleSnapshots: {
          create: condition.rules.map((rule) => ({
            ruleType: rule.type,
            ruleId: rule.ruleId,
            ruleVersion: rule.version,
            snapshotEnc: encryptJson(rule, key, ENCRYPTION_CONTEXT.ruleSnapshot),
          })),
        },
        apiUsage: {
          create: calls.map(({ call }) => ({
            provider: call.provider,
            modelId: call.modelId,
            stage: call.stage,
            inputTokens: call.usage.inputTokens,
            outputTokens: call.usage.outputTokens,
            estimatedCostUsd: 0,
            occurredAt: new Date(call.completedAt),
          })),
        },
      },
    });

    for (const rule of condition.rules) {
      await incrementRuleUsage(transaction, rule);
    }

    return job.id;
  });
}
