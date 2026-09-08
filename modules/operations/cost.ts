import type { ModelPrice, PrismaClient } from "@prisma/client";
import type { AiProviderName } from "@/modules/ai/types";

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
};

export type CostGuardState = "normal" | "warning" | "confirmation_required";

export type CostGuard = {
  state: CostGuardState;
  spentUsd: number;
  limitUsd: number;
  warningAtUsd: number;
  usageRatio: number;
};

export function calculateTokenCost(
  usage: TokenCounts,
  price: Pick<ModelPrice, "inputPricePerMillion" | "outputPricePerMillion">,
): number {
  return (
    (usage.inputTokens * price.inputPricePerMillion +
      usage.outputTokens * price.outputPricePerMillion) /
    1_000_000
  );
}

export function selectApplicablePrice<T extends Pick<ModelPrice, "effectiveFrom" | "effectiveTo">>(
  prices: T[],
  occurredAt: Date,
): T | null {
  return [...prices]
    .filter(
      (price) =>
        price.effectiveFrom <= occurredAt &&
        (!price.effectiveTo || price.effectiveTo >= occurredAt),
    )
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0] ?? null;
}

export async function findApplicablePrice(
  client: PrismaClient,
  provider: AiProviderName,
  modelId: string,
  occurredAt: Date,
): Promise<ModelPrice | null> {
  return client.modelPrice.findFirst({
    where: {
      provider,
      modelId,
      effectiveFrom: { lte: occurredAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: occurredAt } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function assessCostGuard(spentUsd: number, limitUsd: number): CostGuard {
  const safeLimit = Math.max(limitUsd, 0.01);
  const warningAtUsd = safeLimit * 0.8;
  const state: CostGuardState = spentUsd >= safeLimit
    ? "confirmation_required"
    : spentUsd >= warningAtUsd
      ? "warning"
      : "normal";
  return {
    state,
    spentUsd,
    limitUsd: safeLimit,
    warningAtUsd,
    usageRatio: spentUsd / safeLimit,
  };
}
