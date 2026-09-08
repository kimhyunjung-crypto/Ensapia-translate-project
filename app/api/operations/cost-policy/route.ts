import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { updateCostPolicy } from "@/modules/operations/service";
import { costPolicySchema } from "@/modules/operations/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = costPolicySchema.parse(json);
    const policy = await updateCostPolicy(prisma, input.monthlyLimitUsd);
    return Response.json(
      { ok: true, policy: { ...policy, warningAtUsd: policy.monthlyLimitUsd * 0.8 } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
