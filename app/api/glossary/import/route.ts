import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { AppError, safeErrorResponse } from "@/lib/errors";
import {
  GlossaryCsvFormatError,
  parseGlossaryCsv,
  type GlossaryCsvError,
} from "@/modules/glossary/csv";
import { GlossaryRepository } from "@/modules/glossary/repository";

export const dynamic = "force-dynamic";

const MAXIMUM_FILE_SIZE = 1024 * 1024;

type UploadedFile = {
  name: string;
  size: number;
  text(): Promise<string>;
};

function isUploadedFile(value: FormDataEntryValue | null): value is File & UploadedFile {
  return Boolean(
    value &&
      typeof value !== "string" &&
      typeof value.name === "string" &&
      typeof value.size === "number" &&
      typeof value.text === "function",
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => {
      throw new AppError("INVALID_FORM_DATA", "가져올 CSV 파일을 선택해 주세요.");
    });
    const file = formData.get("file");
    if (!isUploadedFile(file)) {
      throw new AppError("FILE_REQUIRED", "가져올 CSV 파일을 선택해 주세요.");
    }
    if (!file.name.toLocaleLowerCase("und").endsWith(".csv")) {
      throw new AppError("INVALID_FILE_TYPE", "CSV 파일만 가져올 수 있습니다.");
    }
    if (file.size > MAXIMUM_FILE_SIZE) {
      throw new AppError("FILE_TOO_LARGE", "CSV 파일은 1MB 이하여야 합니다.");
    }

    const parsed = parseGlossaryCsv(await file.text());
    const repository = new GlossaryRepository(prisma, decodeEncryptionKey());
    const terms = [];
    const errors: GlossaryCsvError[] = [...parsed.errors];

    for (const row of parsed.rows) {
      try {
        terms.push(await repository.create(row.value, "imported"));
      } catch (error) {
        errors.push({
          rowNumber: row.rowNumber,
          reason: error instanceof AppError ? error.message : "용어를 저장하지 못했습니다.",
        });
      }
    }

    errors.sort((left, right) => left.rowNumber - right.rowNumber);
    return Response.json(
      { ok: true, importedCount: terms.length, terms, errors },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GlossaryCsvFormatError) {
      return safeErrorResponse(new AppError("INVALID_CSV_FORMAT", error.message));
    }
    return safeErrorResponse(error);
  }
}
