import { AppError, safeErrorResponse } from "@/lib/errors";
import { translationInputSchema } from "@/lib/validation";
import { createDemoTranslation } from "@/modules/translation/demo-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const input = translationInputSchema.parse(json);
    const translation = createDemoTranslation(input.sourceText);

    return Response.json(
      { ok: true, translation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
