import type { PrismaClient } from "@prisma/client";
import { decryptJson, decryptText, encryptJson, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { toneRuleInputSchema, type ToneRuleInput } from "@/lib/validation";

export type ToneRuleRecord = ToneRuleInput & {
  id: string;
  isActive: boolean;
  usedCount: number;
  version: number;
};

export class ToneRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(input: ToneRuleInput): Promise<ToneRuleRecord> {
    const value = toneRuleInputSchema.parse(input);
    const row = await this.client.toneRule.create({
      data: {
        situation: value.situation,
        recommendedToneEnc: encryptText(
          value.recommendedTone,
          this.key,
          ENCRYPTION_CONTEXT.toneRecommended,
        ),
        cushionPhrasesEnc: encryptJson(
          value.cushionPhrases,
          this.key,
          ENCRYPTION_CONTEXT.toneCushion,
        ),
        forbiddenPhrasesEnc: encryptJson(
          value.forbiddenPhrases,
          this.key,
          ENCRYPTION_CONTEXT.toneForbidden,
        ),
        exampleEnc: value.example
          ? encryptText(value.example, this.key, ENCRYPTION_CONTEXT.toneExample)
          : null,
      },
    });
    return this.toRecord(row);
  }

  async list(): Promise<ToneRuleRecord[]> {
    const rows = await this.client.toneRule.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((row) => this.toRecord(row));
  }

  async findById(id: string): Promise<ToneRuleRecord | null> {
    const row = await this.client.toneRule.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }

  async count(): Promise<number> {
    return this.client.toneRule.count();
  }

  private toRecord(row: Awaited<ReturnType<PrismaClient["toneRule"]["create"]>>): ToneRuleRecord {
    return {
      id: row.id,
      situation: row.situation,
      recommendedTone: decryptText(
        row.recommendedToneEnc,
        this.key,
        ENCRYPTION_CONTEXT.toneRecommended,
      ),
      cushionPhrases: row.cushionPhrasesEnc
        ? decryptJson<string[]>(row.cushionPhrasesEnc, this.key, ENCRYPTION_CONTEXT.toneCushion)
        : [],
      forbiddenPhrases: row.forbiddenPhrasesEnc
        ? decryptJson<string[]>(row.forbiddenPhrasesEnc, this.key, ENCRYPTION_CONTEXT.toneForbidden)
        : [],
      example: row.exampleEnc
        ? decryptText(row.exampleEnc, this.key, ENCRYPTION_CONTEXT.toneExample)
        : undefined,
      isActive: row.isActive,
      usedCount: row.usedCount,
      version: row.version,
    };
  }
}
