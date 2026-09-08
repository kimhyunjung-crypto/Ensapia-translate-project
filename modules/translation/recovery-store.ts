import { randomUUID } from "node:crypto";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { AppError } from "@/lib/errors";
import type { CompletedPipelinePersistenceInput } from "@/modules/translation/pipeline-repository";

export type RecoverableTranslationSave = Omit<
  CompletedPipelinePersistenceInput,
  "client" | "key"
> & { demo: boolean };

type PendingSave = {
  encryptedPayload: string;
  expiresAt: number;
};

const RECOVERY_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_SAVES = 20;
const pendingSaves = new Map<string, PendingSave>();

function removeExpired(now: number): void {
  for (const [id, item] of pendingSaves) {
    if (item.expiresAt <= now) pendingSaves.delete(id);
  }
}

export function registerPendingTranslationSave(
  payload: RecoverableTranslationSave,
  key: Buffer,
  now = Date.now(),
): string {
  removeExpired(now);
  while (pendingSaves.size >= MAX_PENDING_SAVES) {
    const oldestId = pendingSaves.keys().next().value as string | undefined;
    if (!oldestId) break;
    pendingSaves.delete(oldestId);
  }

  const recoveryId = randomUUID();
  pendingSaves.set(recoveryId, {
    encryptedPayload: encryptJson(payload, key, ENCRYPTION_CONTEXT.translationRecovery),
    expiresAt: now + RECOVERY_TTL_MS,
  });
  return recoveryId;
}

export function readPendingTranslationSave(
  recoveryId: string,
  key: Buffer,
  now = Date.now(),
): RecoverableTranslationSave {
  removeExpired(now);
  const pending = pendingSaves.get(recoveryId);
  if (!pending) {
    throw new AppError(
      "TRANSLATION_RECOVERY_NOT_FOUND",
      "저장 복구 정보가 만료되었거나 이미 처리되었습니다. 원문으로 다시 번역해 주세요.",
      404,
    );
  }
  return decryptJson<RecoverableTranslationSave>(
    pending.encryptedPayload,
    key,
    ENCRYPTION_CONTEXT.translationRecovery,
  );
}

export function clearPendingTranslationSave(recoveryId: string): void {
  pendingSaves.delete(recoveryId);
}
