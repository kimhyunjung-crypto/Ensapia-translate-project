import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createSearchFingerprint,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
} from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { AppError } from "@/lib/errors";
import {
  glossaryFormInputSchema,
  type GlossaryFormInput,
  type GlossaryInput,
} from "@/lib/validation";

export type GlossaryTermRecord = GlossaryInput & {
  id: string;
  isActive: boolean;
  usedCount: number;
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type GlossaryChangeAction =
  | "created"
  | "imported"
  | "updated"
  | "deactivated"
  | "reactivated"
  | "deleted";

export type GlossaryChangeRecord = {
  id: string;
  action: GlossaryChangeAction;
  changedFields: string[];
  before?: GlossaryFormInput;
  after?: GlossaryFormInput;
  createdAt: Date;
};

type GlossaryWriteInput = GlossaryInput & { isActive?: boolean };

type ChangePayload = Omit<GlossaryChangeRecord, "id" | "createdAt" | "action">;

const FIELD_LABELS: Record<keyof GlossaryFormInput, string> = {
  sourceText: "원어",
  targetText: "권장 표기",
  direction: "번역 방향",
  description: "설명",
  forbiddenTerms: "금지 표기",
  isActive: "사용 상태",
};

function snapshot(record: GlossaryTermRecord): GlossaryFormInput {
  return {
    sourceText: record.sourceText,
    targetText: record.targetText,
    direction: record.direction,
    description: record.description,
    forbiddenTerms: [...record.forbiddenTerms],
    isActive: record.isActive,
  };
}

function changedFields(before: GlossaryFormInput, after: GlossaryFormInput): string[] {
  return (Object.keys(FIELD_LABELS) as Array<keyof GlossaryFormInput>)
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => FIELD_LABELS[field]);
}

export class GlossaryRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly key: Buffer,
  ) {}

  async create(
    input: GlossaryWriteInput,
    action: Extract<GlossaryChangeAction, "created" | "imported"> = "created",
  ): Promise<GlossaryTermRecord> {
    const value = glossaryFormInputSchema.parse({ ...input, isActive: input.isActive ?? true });
    await this.assertNotDuplicate(value.sourceText, value.direction);

    return this.client.$transaction(async (transaction) => {
      const row = await transaction.glossaryTerm.create({
        data: {
          sourceTextEnc: encryptText(value.sourceText, this.key, ENCRYPTION_CONTEXT.glossarySource),
          sourceFingerprint: this.fingerprint(value.sourceText, value.direction),
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
          isActive: value.isActive,
        },
      });
      await this.writeChange(transaction, row.id, action, {
        changedFields: Object.values(FIELD_LABELS),
        after: value,
      });

      return this.toRecord(row);
    });
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

  async update(id: string, input: GlossaryWriteInput): Promise<GlossaryTermRecord> {
    const existing = await this.requireById(id);
    const value = glossaryFormInputSchema.parse({ ...input, isActive: input.isActive ?? true });
    await this.assertNotDuplicate(value.sourceText, value.direction, id);
    const before = snapshot(existing);
    const fields = changedFields(before, value);

    if (fields.length === 0) return existing;

    return this.client.$transaction(async (transaction) => {
      const row = await transaction.glossaryTerm.update({
        where: { id },
        data: {
          sourceTextEnc: encryptText(value.sourceText, this.key, ENCRYPTION_CONTEXT.glossarySource),
          sourceFingerprint: this.fingerprint(value.sourceText, value.direction),
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
          isActive: value.isActive,
          version: { increment: 1 },
        },
      });
      await this.writeChange(transaction, id, "updated", {
        changedFields: fields,
        before,
        after: value,
      });

      return this.toRecord(row);
    });
  }

  async setActive(id: string, isActive: boolean): Promise<GlossaryTermRecord> {
    const existing = await this.requireById(id);
    if (existing.isActive === isActive) return existing;
    const before = snapshot(existing);
    const after = { ...before, isActive };

    return this.client.$transaction(async (transaction) => {
      const row = await transaction.glossaryTerm.update({
        where: { id },
        data: { isActive, version: { increment: 1 } },
      });
      await this.writeChange(transaction, id, isActive ? "reactivated" : "deactivated", {
        changedFields: [FIELD_LABELS.isActive],
        before,
        after,
      });

      return this.toRecord(row);
    });
  }

  async deleteUnused(id: string): Promise<void> {
    const existing = await this.requireById(id);
    if (existing.usedCount > 0) {
      throw new AppError(
        "GLOSSARY_TERM_IN_USE",
        "번역에 사용된 용어는 삭제할 수 없습니다. 사용 중지로 변경해 주세요.",
        409,
      );
    }

    await this.client.$transaction(async (transaction) => {
      await transaction.glossaryTerm.delete({ where: { id } });
      await this.writeChange(transaction, id, "deleted", {
        changedFields: Object.values(FIELD_LABELS),
        before: snapshot(existing),
      });
    });
  }

  async history(id: string): Promise<GlossaryChangeRecord[]> {
    const rows = await this.client.operationLog.findMany({
      where: { category: "glossary", targetType: "glossary_term", targetId: id },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action as GlossaryChangeAction,
      ...decryptJson<ChangePayload>(
        row.safeMessage ?? "",
        this.key,
        ENCRYPTION_CONTEXT.glossaryChange,
      ),
      createdAt: row.createdAt,
    }));
  }

  private fingerprint(sourceText: string, direction: GlossaryInput["direction"]): string {
    return createSearchFingerprint(
      sourceText,
      this.key,
      `${ENCRYPTION_CONTEXT.glossarySource}:${direction}`,
    );
  }

  private async assertNotDuplicate(
    sourceText: string,
    direction: GlossaryInput["direction"],
    excludedId?: string,
  ): Promise<void> {
    const duplicate = await this.client.glossaryTerm.findFirst({
      where: {
        sourceFingerprint: this.fingerprint(sourceText, direction),
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new AppError(
        "DUPLICATE_GLOSSARY_TERM",
        `같은 번역 방향에 이미 등록된 원어입니다. 기존 항목 ID: ${duplicate.id}`,
        409,
      );
    }
  }

  private async requireById(id: string): Promise<GlossaryTermRecord> {
    const record = await this.findById(id);
    if (!record) throw new AppError("GLOSSARY_TERM_NOT_FOUND", "용어를 찾을 수 없습니다.", 404);
    return record;
  }

  private async writeChange(
    transaction: Prisma.TransactionClient,
    targetId: string,
    action: GlossaryChangeAction,
    payload: ChangePayload,
  ): Promise<void> {
    await transaction.operationLog.create({
      data: {
        category: "glossary",
        action,
        targetType: "glossary_term",
        targetId,
        result: "success",
        safeMessage: encryptJson(payload, this.key, ENCRYPTION_CONTEXT.glossaryChange),
      },
    });
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
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
