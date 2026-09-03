import type { PrismaClient } from "@prisma/client";
import { createSearchFingerprint, decryptText, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { personInputSchema, type PersonInput } from "@/lib/validation";

export type PersonRecord = PersonInput & {
  id: string;
  isActive: boolean;
  usedCount: number;
};

export class PeopleRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(input: PersonInput): Promise<PersonRecord> {
    const value = personInputSchema.parse(input);
    const aliases = [...new Set(value.aliases.map((alias) => alias.normalize("NFKC").trim()))];
    const row = await this.client.person.create({
      data: {
        japaneseCanonicalEnc: encryptText(
          value.japaneseCanonical,
          this.key,
          ENCRYPTION_CONTEXT.personJapanese,
        ),
        koreanCanonicalEnc: encryptText(
          value.koreanCanonical,
          this.key,
          ENCRYPTION_CONTEXT.personKorean,
        ),
        aliases: {
          create: aliases.map((alias) => ({
            aliasEnc: encryptText(alias, this.key, ENCRYPTION_CONTEXT.personAlias),
            aliasFingerprint: createSearchFingerprint(
              alias,
              this.key,
              ENCRYPTION_CONTEXT.personAlias,
            ),
          })),
        },
      },
      include: { aliases: true },
    });

    return this.toRecord(row);
  }

  async list(): Promise<PersonRecord[]> {
    const rows = await this.client.person.findMany({
      include: { aliases: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findById(id: string): Promise<PersonRecord | null> {
    const row = await this.client.person.findUnique({
      where: { id },
      include: { aliases: true },
    });
    return row ? this.toRecord(row) : null;
  }

  async count(): Promise<number> {
    return this.client.person.count();
  }

  private toRecord(
    row: Awaited<ReturnType<PrismaClient["person"]["findFirstOrThrow"]>> & {
      aliases: Array<{ aliasEnc: string }>;
    },
  ): PersonRecord {
    return {
      id: row.id,
      japaneseCanonical: decryptText(
        row.japaneseCanonicalEnc,
        this.key,
        ENCRYPTION_CONTEXT.personJapanese,
      ),
      koreanCanonical: decryptText(
        row.koreanCanonicalEnc,
        this.key,
        ENCRYPTION_CONTEXT.personKorean,
      ),
      aliases: row.aliases.map((alias) =>
        decryptText(alias.aliasEnc, this.key, ENCRYPTION_CONTEXT.personAlias),
      ),
      isActive: row.isActive,
      usedCount: row.usedCount,
    };
  }
}
