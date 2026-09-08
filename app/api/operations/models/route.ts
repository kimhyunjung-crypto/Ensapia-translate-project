import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { updateModelConfigurations } from "@/modules/operations/service";
import { modelConfigurationsSchema } from "@/modules/operations/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = modelConfigurationsSchema.parse(json);
    await updateModelConfigurations(prisma, input.configurations);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
