import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import {
  deleteTranslationsByDate,
  previewTranslationDeletion,
} from "@/modules/operations/service";
import {
  confirmedDeletionSchema,
  deletionRangeSchema,
} from "@/modules/operations/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = deletionRangeSchema.parse({
      dateFrom: url.searchParams.get("dateFrom"),
      dateTo: url.searchParams.get("dateTo"),
    });
    const count = await previewTranslationDeletion(prisma, range.dateFrom, range.dateTo);
    return Response.json(
      { ok: true, preview: { ...range, count } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = confirmedDeletionSchema.parse(json);
    const result = await deleteTranslationsByDate(
      prisma,
      input.dateFrom,
      input.dateTo,
      input.confirmedCount,
    );
    return Response.json({ ok: true, deletion: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
