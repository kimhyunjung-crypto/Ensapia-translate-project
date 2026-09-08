import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { GlossaryRepository } from "@/modules/glossary/repository";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!id) throw new AppError("GLOSSARY_TERM_NOT_FOUND", "용어를 찾을 수 없습니다.", 404);
    const repository = new GlossaryRepository(prisma, decodeEncryptionKey());
    const term = await repository.findById(id);
    if (!term) throw new AppError("GLOSSARY_TERM_NOT_FOUND", "용어를 찾을 수 없습니다.", 404);
    const history = await repository.history(id);

    return Response.json(
      { ok: true, history },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
