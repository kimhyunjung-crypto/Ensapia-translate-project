import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { safeErrorResponse } from "@/lib/errors";
import { loadOperationsOverview } from "@/modules/operations/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operations = await loadOperationsOverview(prisma, decodeEncryptionKey());
    return Response.json(
      { ok: true, operations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
