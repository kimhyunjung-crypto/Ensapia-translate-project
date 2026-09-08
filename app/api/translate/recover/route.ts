import { z } from "zod";
import { AppError, safeErrorResponse } from "@/lib/errors";
import {
  retryTranslationSave,
  type CompletedTranslation,
  TranslationSaveError,
} from "@/modules/translation/service";

export const dynamic = "force-dynamic";

const recoveryRequestSchema = z.object({ recoveryId: z.string().uuid() }).strict();
type RetryTranslationSave = (recoveryId: string) => Promise<CompletedTranslation>;

export function createRecoverTranslationPost(
  retry: RetryTranslationSave = retryTranslationSave,
) {
  return async function POST(request: Request) {
    try {
      const json = await request.json().catch(() => {
        throw new AppError("INVALID_JSON", "요청 형식을 확인해 주세요.");
      });
      const input = recoveryRequestSchema.parse(json);
      const translation = await retry(input.recoveryId);
      return Response.json(
        { ok: true, translation },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof TranslationSaveError) {
        return Response.json(
          {
            ok: false,
            error: { code: error.code, message: error.message },
            recoveryId: error.recoveryId,
          },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      return safeErrorResponse(error);
    }
  };
}

export const POST = createRecoverTranslationPost();
