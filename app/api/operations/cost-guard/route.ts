import { prisma } from "@/lib/database";
import { safeErrorResponse } from "@/lib/errors";
import { getCostGuard } from "@/modules/operations/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await getCostGuard(prisma);
    return Response.json({ ok: true, guard }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
