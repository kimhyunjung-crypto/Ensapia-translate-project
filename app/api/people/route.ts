import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import { personFormInputSchema } from "@/lib/validation";
import { PeopleRepository } from "@/modules/people/repository";

export const dynamic = "force-dynamic";

function repository(): PeopleRepository {
  return new PeopleRepository(prisma, decodeEncryptionKey());
}

export async function GET() {
  try {
    const people = await repository().list();
    return Response.json({ ok: true, people }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = personFormInputSchema.parse(json);
    const person = await repository().create(input);

    return Response.json(
      { ok: true, person },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
