import { z } from "zod";
import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { toneRuleFormInputSchema } from "@/lib/validation";
import { ToneRepository } from "@/modules/tone/repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("update"), rule: toneRuleFormInputSchema }),
  z.object({ operation: z.literal("setActive"), isActive: z.boolean() }),
]);

function repository(): ToneRepository {
  return new ToneRepository(prisma, decodeEncryptionKey());
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!id) throw new AppError("TONE_RULE_NOT_FOUND", "말투 규칙을 찾을 수 없습니다.", 404);
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const patch = patchSchema.parse(json);
    const rule = patch.operation === "update"
      ? await repository().update(id, patch.rule)
      : await repository().setActive(id, patch.isActive);

    return Response.json({ ok: true, rule }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!id) throw new AppError("TONE_RULE_NOT_FOUND", "말투 규칙을 찾을 수 없습니다.", 404);
    await repository().deleteUnused(id);

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
