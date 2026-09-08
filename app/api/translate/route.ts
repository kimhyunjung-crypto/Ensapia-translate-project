import { z } from "zod";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/database";
import { translationInputSchema } from "@/lib/validation";
import type { CostGuard } from "@/modules/operations/cost";
import { getCostGuard } from "@/modules/operations/service";
import {
  executeTranslation,
  type CompletedTranslation,
  TranslationSaveError,
} from "@/modules/translation/service";

export const dynamic = "force-dynamic";

type ExecuteTranslation = (sourceText: string) => Promise<CompletedTranslation>;
type LoadCostGuard = () => Promise<CostGuard>;

const translateRequestSchema = translationInputSchema.extend({
  costConfirmed: z.boolean().optional().default(false),
});

export function createTranslatePost(
  translate: ExecuteTranslation = executeTranslation,
  loadCostGuard: LoadCostGuard = () => getCostGuard(prisma),
) {
  return async function POST(request: Request) {
    try {
      const json = await request.json().catch(() => {
        throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
      });
      const input = translateRequestSchema.parse(json);
      const guard = await loadCostGuard();
      if (guard.state === "confirmation_required" && !input.costConfirmed) {
        throw new AppError(
          "COST_CONFIRMATION_REQUIRED",
          `이번 달 예상 비용이 $${guard.limitUsd.toFixed(2)} 한도에 도달했습니다. 계속하려면 실행을 확인해 주세요.`,
          409,
        );
      }
      const translation = await translate(input.sourceText);

      return Response.json(
        { ok: true, translation },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof TranslationSaveError) {
        return Response.json(
          {
            ok: false,
            error: { code: error.code, message: error.message },
            recoveryId: error.recoveryId,
          },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      return safeErrorResponse(error);
    }
  };
}

export const POST = createTranslatePost();
