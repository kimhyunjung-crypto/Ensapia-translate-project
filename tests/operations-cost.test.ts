// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assessCostGuard,
  calculateTokenCost,
  selectApplicablePrice,
} from "@/modules/operations/cost";
import { seoulDateRange, seoulUsageRanges } from "@/modules/operations/dates";

describe("EPIC 9 dated costs and monthly guard", () => {
  const prices = [
    {
      effectiveFrom: new Date("2026-08-13T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-31T23:59:59.999Z"),
      inputPricePerMillion: 0.75,
      outputPricePerMillion: 3.75,
    },
    {
      effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      effectiveTo: null,
      inputPricePerMillion: 1.5,
      outputPricePerMillion: 7.5,
    },
  ];

  it("switches Gemini pricing at the 2027 effective-date boundary", () => {
    expect(selectApplicablePrice(prices, new Date("2026-12-31T23:59:59.999Z")))
      .toMatchObject({ inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 });
    expect(selectApplicablePrice(prices, new Date("2027-01-01T00:00:00.000Z")))
      .toMatchObject({ inputPricePerMillion: 1.5, outputPricePerMillion: 7.5 });
  });

  it("calculates input and output token cost per one million tokens", () => {
    expect(calculateTokenCost(
      { inputTokens: 800_000, outputTokens: 200_000 },
      { inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 },
    )).toBeCloseTo(1.35, 10);
  });

  it("warns at 80 percent and requires confirmation at 100 percent", () => {
    expect(assessCostGuard(7.9999, 10).state).toBe("normal");
    expect(assessCostGuard(8, 10)).toMatchObject({ state: "warning", warningAtUsd: 8 });
    expect(assessCostGuard(10, 10).state).toBe("confirmation_required");
  });

  it("uses KST boundaries for daily, monthly, and selected deletion ranges", () => {
    const ranges = seoulUsageRanges(new Date("2026-09-08T16:30:00.000Z"));
    expect(ranges.today.start.toISOString()).toBe("2026-09-08T15:00:00.000Z");
    expect(ranges.today.endExclusive.toISOString()).toBe("2026-09-09T15:00:00.000Z");
    expect(ranges.month.start.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(ranges.month.endExclusive.toISOString()).toBe("2026-09-30T15:00:00.000Z");

    const deletion = seoulDateRange("2026-09-01", "2026-09-30");
    expect(deletion.start.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(deletion.endExclusive.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });
});
