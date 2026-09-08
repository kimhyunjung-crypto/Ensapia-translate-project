import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { glossaryFormInputSchema } from "@/lib/validation";
import { GlossaryRepository } from "@/modules/glossary/repository";

export const dynamic = "force-dynamic";

function repository(): GlossaryRepository {
  return new GlossaryRepository(prisma, decodeEncryptionKey());
}

export async function GET() {
  try {
    const terms = await repository().list();
    return Response.json({ ok: true, terms }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = glossaryFormInputSchema.parse(json);
    const term = await repository().create(input);

    return Response.json(
      { ok: true, term },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
