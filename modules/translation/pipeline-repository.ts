import type { Prisma, PrismaClient } from "@prisma/client";
import { encryptJson, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import type { PipelineConfiguration } from "@/modules/ai/types";
import { calculateTokenCost, findApplicablePrice } from "@/modules/operations/cost";
import type { AppliedRule } from "@/modules/rules/engine";
import type {
  PipelineAttemptRecord,
  TranslationPipelineFailure,
  TranslationPipelineResult,
} from "@/modules/translation/pipeline";
import type { FirstPassProviderInput } from "@/modules/translation/provider-inputs";

export type CompletedPipelinePersistenceInput = {
  client: PrismaClient;
  key: Buffer;
  condition: FirstPassProviderInput;
  sourceLanguage: "ko" | "ja";
  targetLanguage: "ko" | "ja";
  configuration: PipelineConfiguration;
  result: TranslationPipelineResult;
};

type PipelineJobInput = Omit<CompletedPipelinePersistenceInput, "result"> & {
  attempts: PipelineAttemptRecord[];
  finalText?: string;
  status: "completed" | "failed";
  failure?: { code: string; message: string };
};

const PROVIDER_LABELS = { openai: "OpenAI", gemini: "Gemini" } as const;
const STAGE_LABELS = { draft: "1차 번역", review: "교차검토", final: "최종 종합" } as const;

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

function attemptOutput(attempt: PipelineAttemptRecord): string {
  if (attempt.outputText !== undefined) return attempt.outputText;
  return JSON.stringify({
    errorCode: attempt.errorCode ?? "AI_CALL_FAILED",
    safeMessage: attempt.safeMessage ?? "AI 단계 실행에 실패했습니다.",
  });
}

function configurationSnapshots(configuration: PipelineConfiguration) {
  return Object.values(configuration).map((item) => ({
    ruleType: "ai_configuration",
    ruleId: item.promptVersionId,
    ruleVersion: 1,
    snapshot: {
      provider: item.provider,
      stage: item.stage,
      modelId: item.modelId,
      promptVersionId: item.promptVersionId,
    },
  }));
}

async function calculateAttemptCosts(
  client: PrismaClient,
  attempts: PipelineAttemptRecord[],
): Promise<Map<PipelineAttemptRecord, number>> {
  const costs = new Map<PipelineAttemptRecord, number>();
  await Promise.all(
    attempts.map(async (attempt) => {
      if (attempt.status !== "completed" || !attempt.usage) return;
      const price = await findApplicablePrice(
        client,
        attempt.provider,
        attempt.modelId,
        new Date(attempt.completedAt),
      );
      costs.set(attempt, price ? calculateTokenCost(attempt.usage, price) : 0);
    }),
  );
  return costs;
}

async function savePipelineJob(input: PipelineJobInput): Promise<string> {
  const {
    client,
    key,
    condition,
    sourceLanguage,
    targetLanguage,
    configuration,
    attempts,
    finalText,
    status,
    failure,
  } = input;
  const completedAttempts = attempts.filter(
    (attempt) => attempt.status === "completed" && attempt.usage,
  );
  const costs = await calculateAttemptCosts(client, completedAttempts);
  const timestamps = attempts.flatMap((attempt) => [attempt.startedAt, attempt.completedAt]);
  const startedAt = new Date(timestamps.length > 0 ? Math.min(...timestamps) : Date.now());
  const completedAt = new Date(timestamps.length > 0 ? Math.max(...timestamps) : Date.now());
  const promptVersionIds = [
    ...new Set(Object.values(configuration).map((item) => item.promptVersionId)),
  ];
  const snapshots = [
    ...condition.rules.map((rule) => ({
      ruleType: rule.type,
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      snapshot: rule,
    })),
    ...configurationSnapshots(configuration),
  ];

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
        finalTextEnc: finalText
          ? encryptText(finalText, key, ENCRYPTION_CONTEXT.translationFinal)
          : null,
        status,
        promptVersionIds: JSON.stringify(promptVersionIds),
        startedAt,
        completedAt,
        outputs: {
          create: attempts.map((attempt) => ({
            provider: attempt.provider,
            stage: attempt.stage,
            outputTextEnc: encryptText(
              attemptOutput(attempt),
              key,
              ENCRYPTION_CONTEXT.translationOutput,
            ),
            status: attempt.status,
            attempt: attempt.attempt,
            latencyMs: Math.max(0, attempt.completedAt - attempt.startedAt),
            createdAt: new Date(attempt.startedAt),
          })),
        },
        ruleSnapshots: {
          create: snapshots.map((snapshot) => ({
            ruleType: snapshot.ruleType,
            ruleId: snapshot.ruleId,
            ruleVersion: snapshot.ruleVersion,
            snapshotEnc: encryptJson(
              snapshot.snapshot,
              key,
              ENCRYPTION_CONTEXT.ruleSnapshot,
            ),
          })),
        },
        apiUsage: {
          create: completedAttempts.map((attempt) => ({
            provider: attempt.provider,
            modelId: attempt.modelId,
            stage: attempt.stage,
            inputTokens: attempt.usage!.inputTokens,
            outputTokens: attempt.usage!.outputTokens,
            estimatedCostUsd: costs.get(attempt) ?? 0,
            occurredAt: new Date(attempt.completedAt),
          })),
        },
      },
    });

    await transaction.operationLog.createMany({
      data: [
        ...attempts.map((attempt) => ({
          category: "translation",
          action: `${attempt.provider}.${attempt.stage}.attempt.${attempt.attempt}`,
          targetType: "translation_job",
          targetId: job.id,
          result: attempt.status === "completed" ? "success" : "failure",
          errorCode: attempt.errorCode,
          safeMessage: attempt.status === "completed"
            ? `${PROVIDER_LABELS[attempt.provider]} ${STAGE_LABELS[attempt.stage]} ${attempt.attempt}회차 완료`
            : attempt.safeMessage,
          createdAt: new Date(attempt.completedAt),
        })),
        {
          category: "translation",
          action: "pipeline.complete",
          targetType: "translation_job",
          targetId: job.id,
          result: status === "completed" ? "success" : "failure",
          errorCode: failure?.code,
          safeMessage: failure?.message ?? "전체 번역 및 저장 완료",
          createdAt: completedAt,
        },
      ],
    });

    if (status === "completed") {
      for (const rule of condition.rules) await incrementRuleUsage(transaction, rule);
    }

    return job.id;
  });
}

export async function saveCompletedPipeline(
  input: CompletedPipelinePersistenceInput,
): Promise<string> {
  return savePipelineJob({
    ...input,
    attempts: input.result.attempts,
    finalText: input.result.finalText,
    status: "completed",
  });
}

export async function saveFailedPipeline(input: {
  client: PrismaClient;
  key: Buffer;
  condition: FirstPassProviderInput;
  sourceLanguage: "ko" | "ja";
  targetLanguage: "ko" | "ja";
  configuration: PipelineConfiguration;
  failure: TranslationPipelineFailure;
}): Promise<string> {
  return savePipelineJob({
    ...input,
    attempts: input.failure.attempts,
    status: "failed",
    failure: { code: input.failure.code, message: input.failure.message },
  });
}
