import { getDatabaseHealth } from "@/lib/database-health";
import { safeErrorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getDatabaseHealth();
    return Response.json(
      { ok: true, database: health },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
