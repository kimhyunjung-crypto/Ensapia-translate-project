import type { Prisma, PrismaClient } from "@prisma/client";
import { decryptJson, decryptText, encryptJson, encryptText } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { AppError } from "@/lib/errors";
import {
  toneRuleFormInputSchema,
  type ToneRuleFormInput,
  type ToneRuleInput,
} from "@/lib/validation";
import { normalizePhrases } from "@/modules/tone/phrases";

export type ToneRuleRecord = ToneRuleInput & {
  id: string;
  isActive: boolean;
  usedCount: number;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ToneChangeAction =
  | "created"
  | "updated"
  | "deactivated"
  | "reactivated"
  | "deleted";

export type ToneChangeRecord = {
  id: string;
  action: ToneChangeAction;
  changedFields: string[];
  before?: ToneRuleFormInput;
  after?: ToneRuleFormInput;
  version: number;
  createdAt: Date;
};

type ToneWriteInput = ToneRuleInput & { isActive?: boolean };
type ToneChangePayload = Omit<ToneChangeRecord, "id" | "createdAt" | "action">;

const FIELD_LABELS: Record<keyof ToneRuleFormInput, string> = {
  situation: "상황",
  recommendedTone: "권장 어조",
  cushionPhrases: "쿠션어",
  forbiddenPhrases: "금지 표현",
  example: "예문",
  isActive: "사용 상태",
};

function snapshot(record: ToneRuleRecord): ToneRuleFormInput {
  return {
    situation: record.situation,
    recommendedTone: record.recommendedTone,
    cushionPhrases: [...record.cushionPhrases],
    forbiddenPhrases: [...record.forbiddenPhrases],
    example: record.example,
    isActive: record.isActive,
  };
}

function changedFields(before: ToneRuleFormInput, after: ToneRuleFormInput): string[] {
  return (Object.keys(FIELD_LABELS) as Array<keyof ToneRuleFormInput>)
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => FIELD_LABELS[field]);
}

export class ToneRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(input: ToneWriteInput): Promise<ToneRuleRecord> {
    const value = this.parseInput(input);
    await this.assertSituationAvailable(value.situation);

    return this.client.$transaction(async (transaction) => {
      const row = await transaction.toneRule.create({ data: this.encryptedData(value) });
      await this.writeChange(transaction, row.id, "created", {
        changedFields: Object.values(FIELD_LABELS),
        after: value,
        version: row.version,
      });
      return this.toRecord(row);
    });
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

  async update(id: string, input: ToneWriteInput): Promise<ToneRuleRecord> {
    const existing = await this.requireById(id);
    const value = this.parseInput(input);
    await this.assertSituationAvailable(value.situation, id);
    const before = snapshot(existing);
    const fields = changedFields(before, value);
    if (fields.length === 0) return existing;

    return this.client.$transaction(async (transaction) => {
      const row = await transaction.toneRule.update({
        where: { id },
        data: { ...this.encryptedData(value), version: { increment: 1 } },
      });
      await this.writeChange(transaction, id, "updated", {
        changedFields: fields,
        before,
        after: value,
        version: row.version,
      });
      return this.toRecord(row);
    });
  }

  async setActive(id: string, isActive: boolean): Promise<ToneRuleRecord> {
    const existing = await this.requireById(id);
    if (existing.isActive === isActive) return existing;
    const before = snapshot(existing);
    const after = { ...before, isActive };

    return this.client.$transaction(async (transaction) => {
      const row = await transaction.toneRule.update({
        where: { id },
        data: { isActive, version: { increment: 1 } },
      });
      await this.writeChange(transaction, id, isActive ? "reactivated" : "deactivated", {
        changedFields: [FIELD_LABELS.isActive],
        before,
        after,
        version: row.version,
      });
      return this.toRecord(row);
    });
  }

  async deleteUnused(id: string): Promise<void> {
    const existing = await this.requireById(id);
    if (existing.usedCount > 0) {
      throw new AppError(
        "TONE_RULE_IN_USE",
        "번역에 사용된 말투 규칙은 삭제할 수 없습니다. 사용 중지로 변경해 주세요.",
        409,
      );
    }

    await this.client.$transaction(async (transaction) => {
      await transaction.toneRule.delete({ where: { id } });
      await this.writeChange(transaction, id, "deleted", {
        changedFields: Object.values(FIELD_LABELS),
        before: snapshot(existing),
        version: existing.version,
      });
    });
  }

  async history(id: string): Promise<ToneChangeRecord[]> {
    const rows = await this.client.operationLog.findMany({
      where: { category: "tone", targetType: "tone_rule", targetId: id },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action as ToneChangeAction,
      ...decryptJson<ToneChangePayload>(
        row.safeMessage ?? "",
        this.key,
        ENCRYPTION_CONTEXT.toneChange,
      ),
      createdAt: row.createdAt,
    }));
  }

  private parseInput(input: ToneWriteInput): ToneRuleFormInput {
    return toneRuleFormInputSchema.parse({
      ...input,
      cushionPhrases: normalizePhrases(input.cushionPhrases),
      forbiddenPhrases: normalizePhrases(input.forbiddenPhrases),
      example: input.example?.trim() || undefined,
      isActive: input.isActive ?? true,
    });
  }

  private encryptedData(value: ToneRuleFormInput): Prisma.ToneRuleUncheckedCreateInput {
    return {
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
      isActive: value.isActive,
    };
  }

  private async assertSituationAvailable(situation: string, excludedId?: string): Promise<void> {
    const normalized = situation.normalize("NFKC").trim().toLocaleLowerCase("und");
    const rows = await this.client.toneRule.findMany({
      where: excludedId ? { id: { not: excludedId } } : undefined,
      select: { id: true, situation: true },
    });
    const duplicate = rows.find(
      (row) => row.situation.normalize("NFKC").trim().toLocaleLowerCase("und") === normalized,
    );
    if (duplicate) {
      throw new AppError(
        "DUPLICATE_TONE_SITUATION",
        `‘${situation}’ 상황 규칙은 이미 등록되어 있습니다. 기존 항목 ID: ${duplicate.id}`,
        409,
      );
    }
  }

  private async requireById(id: string): Promise<ToneRuleRecord> {
    const rule = await this.findById(id);
    if (!rule) throw new AppError("TONE_RULE_NOT_FOUND", "말투 규칙을 찾을 수 없습니다.", 404);
    return rule;
  }

  private async writeChange(
    transaction: Prisma.TransactionClient,
    targetId: string,
    action: ToneChangeAction,
    payload: ToneChangePayload,
  ): Promise<void> {
    await transaction.operationLog.create({
      data: {
        category: "tone",
        action,
        targetType: "tone_rule",
        targetId,
        result: "success",
        safeMessage: encryptJson(payload, this.key, ENCRYPTION_CONTEXT.toneChange),
      },
    });
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
