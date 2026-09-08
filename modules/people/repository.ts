import type { Prisma, PrismaClient } from "@prisma/client";
import { createSearchFingerprint, decryptText, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { AppError } from "@/lib/errors";
import { personFormInputSchema, type PersonFormInput, type PersonInput } from "@/lib/validation";
import { normalizeAliases } from "@/modules/people/aliases";

export type PersonRecord = PersonInput & {
  id: string;
  isActive: boolean;
  usedCount: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type PersonWriteInput = PersonInput & { isActive?: boolean };

export class PeopleRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(input: PersonWriteInput): Promise<PersonRecord> {
    const value = this.parseInput(input);
    await this.assertAliasesAvailable(value.aliases);
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
        isActive: value.isActive,
        aliases: { create: value.aliases.map((alias) => this.aliasData(alias)) },
      },
      include: { aliases: { orderBy: { createdAt: "asc" } } },
    });

    return this.toRecord(row);
  }

  async list(): Promise<PersonRecord[]> {
    const rows = await this.client.person.findMany({
      include: { aliases: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findById(id: string): Promise<PersonRecord | null> {
    const row = await this.client.person.findUnique({
      where: { id },
      include: { aliases: { orderBy: { createdAt: "asc" } } },
    });
    return row ? this.toRecord(row) : null;
  }

  async count(): Promise<number> {
    return this.client.person.count();
  }

  async update(id: string, input: PersonWriteInput): Promise<PersonRecord> {
    await this.requireById(id);
    const value = this.parseInput(input);
    await this.assertAliasesAvailable(value.aliases, id);

    return this.client.$transaction(async (transaction) => {
      await transaction.personAlias.deleteMany({ where: { personId: id } });
      const row = await transaction.person.update({
        where: { id },
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
          isActive: value.isActive,
          aliases: { create: value.aliases.map((alias) => this.aliasData(alias)) },
        },
        include: { aliases: { orderBy: { createdAt: "asc" } } },
      });

      return this.toRecord(row);
    });
  }

  async setActive(id: string, isActive: boolean): Promise<PersonRecord> {
    await this.requireById(id);
    const row = await this.client.person.update({
      where: { id },
      data: { isActive },
      include: { aliases: { orderBy: { createdAt: "asc" } } },
    });

    return this.toRecord(row);
  }

  async deleteUnused(id: string): Promise<void> {
    const existing = await this.requireById(id);
    if (existing.usedCount > 0) {
      throw new AppError(
        "PERSON_RULE_IN_USE",
        "번역에 사용된 인명·호칭 규칙은 삭제할 수 없습니다. 사용 중지로 변경해 주세요.",
        409,
      );
    }
    await this.client.person.delete({ where: { id } });
  }

  private parseInput(input: PersonWriteInput): PersonFormInput {
    return personFormInputSchema.parse({
      ...input,
      aliases: normalizeAliases(input.aliases),
      isActive: input.isActive ?? true,
    });
  }

  private aliasData(alias: string): Prisma.PersonAliasCreateWithoutPersonInput {
    return {
      aliasEnc: encryptText(alias, this.key, ENCRYPTION_CONTEXT.personAlias),
      aliasFingerprint: createSearchFingerprint(alias, this.key, ENCRYPTION_CONTEXT.personAlias),
    };
  }

  private async assertAliasesAvailable(aliases: string[], excludedPersonId?: string): Promise<void> {
    const fingerprints = aliases.map((alias) =>
      createSearchFingerprint(alias, this.key, ENCRYPTION_CONTEXT.personAlias),
    );
    const duplicate = await this.client.personAlias.findFirst({
      where: {
        aliasFingerprint: { in: fingerprints },
        ...(excludedPersonId ? { personId: { not: excludedPersonId } } : {}),
      },
      select: { aliasEnc: true, personId: true },
    });
    if (!duplicate) return;

    const alias = decryptText(duplicate.aliasEnc, this.key, ENCRYPTION_CONTEXT.personAlias);
    throw new AppError(
      "DUPLICATE_PERSON_ALIAS",
      `‘${alias}’ 인식 표현은 다른 규칙에 이미 등록되어 있습니다. 기존 항목 ID: ${duplicate.personId}`,
      409,
    );
  }

  private async requireById(id: string): Promise<PersonRecord> {
    const person = await this.findById(id);
    if (!person) throw new AppError("PERSON_RULE_NOT_FOUND", "인명·호칭 규칙을 찾을 수 없습니다.", 404);
    return person;
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
