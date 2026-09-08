import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { toneRuleFormInputSchema } from "@/lib/validation";
import { ToneRepository } from "@/modules/tone/repository";

export const dynamic = "force-dynamic";

function repository(): ToneRepository {
  return new ToneRepository(prisma, decodeEncryptionKey());
}

export async function GET() {
  try {
    const rules = await repository().list();
    return Response.json({ ok: true, rules }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = toneRuleFormInputSchema.parse(json);
    const rule = await repository().create(input);

    return Response.json(
      { ok: true, rule },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
