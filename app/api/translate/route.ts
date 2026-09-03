import { AppError, safeErrorResponse } from "@/lib/errors";
import type { TranslationDirection } from "@/lib/language";
import { translationInputSchema } from "@/lib/validation";
import { createDemoTranslation } from "@/modules/translation/demo-service";
import { prepareFirstPassProviderRequests } from "@/modules/translation/provider-inputs";

export const dynamic = "force-dynamic";

type PrepareProviderRequests = (
  sourceText: string,
  direction: TranslationDirection,
) => Promise<unknown>;

export function createTranslatePost(
  prepareProviderRequests: PrepareProviderRequests = prepareFirstPassProviderRequests,
) {
  return async function POST(request: Request) {
    try {
      const json = await request.json().catch(() => {
        throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
      });
      const input = translationInputSchema.parse(json);
      const translation = createDemoTranslation(input.sourceText);

      await prepareProviderRequests(input.sourceText, translation.direction);

      return Response.json(
        { ok: true, translation },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return safeErrorResponse(error);
    }
  };
}

export const POST = createTranslatePost();
