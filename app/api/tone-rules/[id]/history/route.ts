import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { ToneRepository } from "@/modules/tone/repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!id) throw new AppError("TONE_RULE_NOT_FOUND", "말투 규칙을 찾을 수 없습니다.", 404);
    const repository = new ToneRepository(prisma, decodeEncryptionKey());
    const rule = await repository.findById(id);
    if (!rule) throw new AppError("TONE_RULE_NOT_FOUND", "말투 규칙을 찾을 수 없습니다.", 404);
    const history = await repository.history(id);

    return Response.json(
      { ok: true, history },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
