import { AppError, safeErrorResponse } from "@/lib/errors";
import { translationInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
    });
    const value = translationInputSchema.parse(json);

    return Response.json({ ok: true, length: value.sourceText.length });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
