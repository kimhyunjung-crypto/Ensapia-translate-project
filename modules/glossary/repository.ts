import type { PrismaClient } from "@prisma/client";
import {
  createSearchFingerprint,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
} from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { glossaryInputSchema, type GlossaryInput } from "@/lib/validation";

export type GlossaryTermRecord = GlossaryInput & {
  id: string;
  isActive: boolean;
  usedCount: number;
};

export class GlossaryRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(input: GlossaryInput): Promise<GlossaryTermRecord> {
    const value = glossaryInputSchema.parse(input);
    const row = await this.client.glossaryTerm.create({
      data: {
        sourceTextEnc: encryptText(value.sourceText, this.key, ENCRYPTION_CONTEXT.glossarySource),
        sourceFingerprint: createSearchFingerprint(
          value.sourceText,
          this.key,
          `${ENCRYPTION_CONTEXT.glossarySource}:${value.direction}`,
        ),
        targetTextEnc: encryptText(value.targetText, this.key, ENCRYPTION_CONTEXT.glossaryTarget),
        direction: value.direction,
        descriptionEnc: value.description
          ? encryptText(value.description, this.key, ENCRYPTION_CONTEXT.glossaryDescription)
          : null,
        forbiddenTermsEnc: encryptJson(
          value.forbiddenTerms,
          this.key,
          ENCRYPTION_CONTEXT.glossaryForbidden,
        ),
      },
    });

    return this.toRecord(row);
  }

  async list(): Promise<GlossaryTermRecord[]> {
    const rows = await this.client.glossaryTerm.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((row) => this.toRecord(row));
  }

  async findById(id: string): Promise<GlossaryTermRecord | null> {
    const row = await this.client.glossaryTerm.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }

  async count(): Promise<number> {
    return this.client.glossaryTerm.count();
  }

  private toRecord(row: Awaited<ReturnType<PrismaClient["glossaryTerm"]["create"]>>): GlossaryTermRecord {
    return {
      id: row.id,
      sourceText: decryptText(row.sourceTextEnc, this.key, ENCRYPTION_CONTEXT.glossarySource),
      targetText: decryptText(row.targetTextEnc, this.key, ENCRYPTION_CONTEXT.glossaryTarget),
      direction: row.direction as GlossaryInput["direction"],
      description: row.descriptionEnc
        ? decryptText(row.descriptionEnc, this.key, ENCRYPTION_CONTEXT.glossaryDescription)
        : undefined,
      forbiddenTerms: row.forbiddenTermsEnc
        ? decryptJson<string[]>(row.forbiddenTermsEnc, this.key, ENCRYPTION_CONTEXT.glossaryForbidden)
        : [],
      isActive: row.isActive,
      usedCount: row.usedCount,
    };
  }
}
