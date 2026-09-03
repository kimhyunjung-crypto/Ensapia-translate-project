import type { PrismaClient } from "@prisma/client";
import { decryptText, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { translationInputSchema } from "@/lib/validation";

export type TranslationJobRecord = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  finalText?: string;
  status: string;
};

export class TranslationRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(input: {
    sourceText: string;
    sourceLanguage: string;
    targetLanguage: string;
    finalText?: string;
    status?: string;
  }): Promise<TranslationJobRecord> {
    const value = translationInputSchema.parse({ sourceText: input.sourceText });
    const row = await this.client.translationJob.create({
      data: {
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        sourceTextEnc: encryptText(
          value.sourceText,
          this.key,
          ENCRYPTION_CONTEXT.translationSource,
        ),
        finalTextEnc: input.finalText
          ? encryptText(input.finalText, this.key, ENCRYPTION_CONTEXT.translationFinal)
          : null,
        status: input.status ?? "pending",
      },
    });
    return this.toRecord(row);
  }

  async latest(): Promise<TranslationJobRecord | null> {
    const row = await this.client.translationJob.findFirst({ orderBy: { startedAt: "desc" } });
    return row ? this.toRecord(row) : null;
  }

  async findById(id: string): Promise<TranslationJobRecord | null> {
    const row = await this.client.translationJob.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }

  async count(): Promise<number> {
    return this.client.translationJob.count();
  }

  private toRecord(
    row: Awaited<ReturnType<PrismaClient["translationJob"]["create"]>>,
  ): TranslationJobRecord {
    return {
      id: row.id,
      sourceLanguage: row.sourceLanguage,
      targetLanguage: row.targetLanguage,
      sourceText: decryptText(row.sourceTextEnc, this.key, ENCRYPTION_CONTEXT.translationSource),
      finalText: row.finalTextEnc
        ? decryptText(row.finalTextEnc, this.key, ENCRYPTION_CONTEXT.translationFinal)
        : undefined,
      status: row.status,
    };
  }
}
