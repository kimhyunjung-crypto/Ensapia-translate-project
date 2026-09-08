import type { Prisma, PrismaClient } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { getEnvironmentStatus } from "@/lib/environment";
import { AppError } from "@/lib/errors";
import {
  loadPipelineConfiguration,
  REQUIRED_STAGES,
  type ConfigurationKey,
} from "@/modules/ai/configuration";
import type { AiProviderName } from "@/modules/ai/types";
import { assessCostGuard, type CostGuard } from "@/modules/operations/cost";
import { seoulDateRange, seoulUsageRanges, type DateRange } from "@/modules/operations/dates";
import type { ModelConfigurationInput } from "@/modules/operations/validation";

const DEFAULT_MONTHLY_LIMIT_USD = 10;
const CALLS_PER_TRANSLATION = 5;

const STAGE_LABELS: Record<ConfigurationKey, string> = {
  openaiDraft: "OpenAI 1차 번역",
  geminiDraft: "Gemini 1차 번역",
  openaiReview: "OpenAI 교차검토",
  geminiReview: "Gemini 교차검토",
  openaiFinal: "OpenAI 최종 종합",
};

type UsageRow = {
  jobId: string | null;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type UsageSummary = {
  translations: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byProvider: Array<{
    provider: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }>;
};

function summarizeRows(rows: UsageRow[]): UsageSummary {
  const linkedJobs = new Set(rows.flatMap((row) => row.jobId ? [row.jobId] : []));
  const orphanCalls = rows.filter((row) => !row.jobId).length;
  const providerRows = new Map<string, UsageRow[]>();
  for (const row of rows) {
    providerRows.set(row.provider, [...(providerRows.get(row.provider) ?? []), row]);
  }
  const sum = (values: UsageRow[], field: "inputTokens" | "outputTokens" | "estimatedCostUsd") =>
    values.reduce((total, value) => total + value[field], 0);
  return {
    translations: linkedJobs.size + Math.ceil(orphanCalls / CALLS_PER_TRANSLATION),
    calls: rows.length,
    inputTokens: sum(rows, "inputTokens"),
    outputTokens: sum(rows, "outputTokens"),
    estimatedCostUsd: sum(rows, "estimatedCostUsd"),
    byProvider: [...providerRows.entries()].map(([provider, values]) => ({
      provider,
      calls: values.length,
      inputTokens: sum(values, "inputTokens"),
      outputTokens: sum(values, "outputTokens"),
      estimatedCostUsd: sum(values, "estimatedCostUsd"),
    })),
  };
}

async function usageForRange(client: PrismaClient, range: DateRange): Promise<UsageSummary> {
  const rows = await client.apiUsage.findMany({
    where: { occurredAt: { gte: range.start, lt: range.endExclusive } },
    select: {
      jobId: true,
      provider: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostUsd: true,
    },
  });
  return summarizeRows(rows);
}

export async function getCostPolicy(client: PrismaClient): Promise<{ monthlyLimitUsd: number }> {
  const setting = await client.appSetting.findUnique({ where: { key: "cost-policy" } });
  if (!setting) return { monthlyLimitUsd: DEFAULT_MONTHLY_LIMIT_USD };
  try {
    const parsed = JSON.parse(setting.valueJson) as { monthlyLimitUsd?: unknown };
    return typeof parsed.monthlyLimitUsd === "number" && Number.isFinite(parsed.monthlyLimitUsd)
      ? { monthlyLimitUsd: Math.max(0.01, parsed.monthlyLimitUsd) }
      : { monthlyLimitUsd: DEFAULT_MONTHLY_LIMIT_USD };
  } catch {
    return { monthlyLimitUsd: DEFAULT_MONTHLY_LIMIT_USD };
  }
}

export async function updateCostPolicy(
  client: PrismaClient,
  monthlyLimitUsd: number,
): Promise<{ monthlyLimitUsd: number }> {
  const policy = { monthlyLimitUsd };
  await client.appSetting.upsert({
    where: { key: "cost-policy" },
    create: { key: "cost-policy", valueJson: JSON.stringify(policy) },
    update: { valueJson: JSON.stringify(policy) },
  });
  return policy;
}

export async function getCostGuard(
  client: PrismaClient,
  now = new Date(),
): Promise<CostGuard> {
  const [policy, month] = await Promise.all([
    getCostPolicy(client),
    usageForRange(client, seoulUsageRanges(now).month),
  ]);
  return assessCostGuard(month.estimatedCostUsd, policy.monthlyLimitUsd);
}

function assertSupportedConfiguration(input: ModelConfigurationInput): void {
  const supported = REQUIRED_STAGES.some(
    (stage) => stage.provider === input.provider && stage.stage === input.stage,
  );
  if (!supported) {
    throw new AppError("UNSUPPORTED_MODEL_STAGE", "지원하지 않는 공급자·단계 조합입니다.");
  }
}

export async function updateModelConfigurations(
  client: PrismaClient,
  inputs: ModelConfigurationInput[],
  effectiveFrom = new Date(),
): Promise<void> {
  const keys = new Set<string>();
  for (const input of inputs) {
    assertSupportedConfiguration(input);
    const key = `${input.provider}:${input.stage}`;
    if (keys.has(key)) throw new AppError("DUPLICATE_MODEL_STAGE", "같은 단계가 중복되었습니다.");
    keys.add(key);
  }

  await client.$transaction(async (transaction) => {
    for (const input of inputs) {
      const activeConfigurations = await transaction.modelConfig.findMany({
        where: { provider: input.provider, stage: input.stage, isActive: true },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      });
      const current = activeConfigurations[0];
      if (current?.modelId === input.modelId) {
        const duplicateIds = activeConfigurations.slice(1).map((configuration) => configuration.id);
        if (duplicateIds.length > 0) {
          await transaction.modelConfig.updateMany({
            where: { id: { in: duplicateIds } },
            data: { isActive: false },
          });
        }
        continue;
      }
      await transaction.modelConfig.updateMany({
        where: { provider: input.provider, stage: input.stage, isActive: true },
        data: { isActive: false },
      });
      await transaction.modelConfig.create({
        data: {
          provider: input.provider,
          stage: input.stage,
          modelId: input.modelId,
          settings: current?.settings ?? "{}",
          isActive: true,
          effectiveFrom,
        },
      });
    }
  });
}

export async function previewTranslationDeletion(
  client: PrismaClient,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const range = seoulDateRange(dateFrom, dateTo);
  return client.translationJob.count({
    where: { startedAt: { gte: range.start, lt: range.endExclusive } },
  });
}

export async function deleteTranslationsByDate(
  client: PrismaClient,
  dateFrom: string,
  dateTo: string,
  confirmedCount: number,
): Promise<{ deletedJobCount: number }> {
  const range = seoulDateRange(dateFrom, dateTo);
  return client.$transaction(async (transaction) => {
    const where: Prisma.TranslationJobWhereInput = {
      startedAt: { gte: range.start, lt: range.endExclusive },
    };
    const currentCount = await transaction.translationJob.count({ where });
    if (currentCount !== confirmedCount) {
      throw new AppError(
        "DELETION_COUNT_CHANGED",
        `삭제 대상이 ${currentCount}건으로 바뀌었습니다. 다시 확인해 주세요.`,
        409,
      );
    }
    if (currentCount === 0) {
      throw new AppError("NO_TRANSLATIONS_TO_DELETE", "선택한 기간에 삭제할 번역이 없습니다.", 409);
    }
    const deleted = await transaction.translationJob.deleteMany({ where });
    await transaction.deletionLog.create({
      data: {
        dateFrom: range.start,
        dateTo: new Date(range.endExclusive.getTime() - 1),
        deletedJobCount: deleted.count,
      },
    });
    return { deletedJobCount: deleted.count };
  });
}

function connectionStatuses() {
  const environment = getEnvironmentStatus();
  const status = (provider: AiProviderName, key: "OPENAI_API_KEY" | "GEMINI_API_KEY") => {
    if (environment.dataMode === "demo") {
      return { provider, connected: true, message: "데모 공급자 연결됨" };
    }
    if (environment.missing.includes(key)) {
      return { provider, connected: false, message: "실제 API 키가 설정되지 않았습니다." };
    }
    return { provider, connected: true, message: "실제 API 키 설정됨" };
  };
  return {
    dataMode: environment.dataMode,
    providers: [status("openai", "OPENAI_API_KEY"), status("gemini", "GEMINI_API_KEY")],
  };
}

export async function loadOperationsOverview(
  client: PrismaClient,
  key: Buffer,
  now = new Date(),
) {
  const ranges = seoulUsageRanges(now);
  const configuration = await loadPipelineConfiguration(client, now);
  const promptIds = Object.values(configuration).map((item) => item.promptVersionId);
  const [prompts, prices, policy, today, month, lastJob] = await Promise.all([
    client.promptVersion.findMany({ where: { id: { in: promptIds } } }),
    client.modelPrice.findMany({ orderBy: [{ provider: "asc" }, { effectiveFrom: "asc" }] }),
    getCostPolicy(client),
    usageForRange(client, ranges.today),
    usageForRange(client, ranges.month),
    client.translationJob.findFirst({
      where: { status: "completed" },
      orderBy: { startedAt: "desc" },
      include: { apiUsage: true },
    }),
  ]);
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const lastUsage = lastJob ? summarizeRows(lastJob.apiUsage) : null;
  const connection = connectionStatuses();

  return {
    generatedAt: now,
    dataMode: connection.dataMode,
    providers: connection.providers,
    configurations: REQUIRED_STAGES.map(({ key: configurationKey }) => {
      const item = configuration[configurationKey];
      const prompt = promptById.get(item.promptVersionId);
      return {
        key: configurationKey,
        label: STAGE_LABELS[configurationKey],
        provider: item.provider,
        stage: item.stage,
        modelId: item.modelId,
        promptVersionId: item.promptVersionId,
        promptVersion: prompt?.version ?? "알 수 없음",
      };
    }),
    prices: prices.map((price) => ({
      id: price.id,
      provider: price.provider,
      modelId: price.modelId,
      inputPricePerMillion: price.inputPricePerMillion,
      outputPricePerMillion: price.outputPricePerMillion,
      effectiveFrom: price.effectiveFrom,
      effectiveTo: price.effectiveTo,
    })),
    costPolicy: {
      ...policy,
      warningAtUsd: policy.monthlyLimitUsd * 0.8,
    },
    usage: {
      last: lastJob && lastUsage ? {
        jobId: lastJob.id,
        occurredAt: lastJob.startedAt,
        characters: Array.from(
          decryptText(lastJob.sourceTextEnc, key, ENCRYPTION_CONTEXT.translationSource),
        ).length,
        ...lastUsage,
      } : null,
      today,
      month,
    },
    storagePolicy: {
      local: ["원문", "두 AI의 1차 번역", "두 교차검토", "최종 번역", "적용 규칙과 사용량"],
      external: "현재 번역의 원문과 적용 규칙만 OpenAI·Gemini에 전송",
      access: "현재 Windows PC의 127.0.0.1 사용자만 접근",
      retention: "자동 삭제 없음 · 사용자가 선택한 기간만 직접 삭제",
    },
  };
}
