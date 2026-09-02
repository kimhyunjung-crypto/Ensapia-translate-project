import { getEnvironmentStatus } from "@/lib/environment";

export const dynamic = "force-dynamic";

export function GET() {
  const status = getEnvironmentStatus();

  return Response.json(
    {
      ok: true,
      localOnly: true,
      environment: status,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
