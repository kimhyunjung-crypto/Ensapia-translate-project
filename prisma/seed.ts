import { PrismaClient } from "@prisma/client";
import { config as loadEnvironmentFile } from "dotenv";
import { pathToFileURL } from "node:url";
import {
  createSearchFingerprint,
  decodeEncryptionKey,
  encryptJson,
  encryptText,
} from "../lib/crypto";
import { ENCRYPTION_CONTEXT } from "../lib/encryption-contexts";

loadEnvironmentFile({ path: ".env.local", quiet: true });
loadEnvironmentFile({ path: ".env", quiet: true });

const seedDate = new Date("2026-01-01T00:00:00.000Z");

export async function seedDatabase(client: PrismaClient, key = decodeEncryptionKey()): Promise<void> {
  const glossarySource = "Ontos";
  const glossaryDirection = "ko-ja";
  await client.glossaryTerm.upsert({
    where: { id: "seed-glossary-ontos" },
    create: {
      id: "seed-glossary-ontos",
      sourceTextEnc: encryptText(glossarySource, key, ENCRYPTION_CONTEXT.glossarySource),
      sourceFingerprint: createSearchFingerprint(
        glossarySource,
        key,
        `${ENCRYPTION_CONTEXT.glossarySource}:${glossaryDirection}`,
      ),
      targetTextEnc: encryptText("Ontos（IAM）", key, ENCRYPTION_CONTEXT.glossaryTarget),
      direction: glossaryDirection,
      descriptionEnc: encryptText(
        "연습용 가상 서비스 이름",
        key,
        ENCRYPTION_CONTEXT.glossaryDescription,
      ),
      forbiddenTermsEnc: encryptJson(["온토스"], key, ENCRYPTION_CONTEXT.glossaryForbidden),
      createdAt: seedDate,
    },
    update: {
      sourceTextEnc: encryptText(glossarySource, key, ENCRYPTION_CONTEXT.glossarySource),
      sourceFingerprint: createSearchFingerprint(
        glossarySource,
        key,
        `${ENCRYPTION_CONTEXT.glossarySource}:${glossaryDirection}`,
      ),
      targetTextEnc: encryptText("Ontos（IAM）", key, ENCRYPTION_CONTEXT.glossaryTarget),
      descriptionEnc: encryptText(
        "연습용 가상 서비스 이름",
        key,
        ENCRYPTION_CONTEXT.glossaryDescription,
      ),
      forbiddenTermsEnc: encryptJson(["온토스"], key, ENCRYPTION_CONTEXT.glossaryForbidden),
      isActive: true,
    },
  });

  const titleSource = "대표님";
  const titleDirection = "ko-ja";
  await client.glossaryTerm.upsert({
    where: { id: "seed-glossary-title" },
    create: {
      id: "seed-glossary-title",
      sourceTextEnc: encryptText(titleSource, key, ENCRYPTION_CONTEXT.glossarySource),
      sourceFingerprint: createSearchFingerprint(
        titleSource,
        key,
        `${ENCRYPTION_CONTEXT.glossarySource}:${titleDirection}`,
      ),
      targetTextEnc: encryptText("代表様", key, ENCRYPTION_CONTEXT.glossaryTarget),
      direction: titleDirection,
      descriptionEnc: encryptText(
        "일반 대표 호칭",
        key,
        ENCRYPTION_CONTEXT.glossaryDescription,
      ),
      forbiddenTermsEnc: encryptJson(
        ["代表さん"],
        key,
        ENCRYPTION_CONTEXT.glossaryForbidden,
      ),
      createdAt: seedDate,
    },
    update: {
      sourceTextEnc: encryptText(titleSource, key, ENCRYPTION_CONTEXT.glossarySource),
      sourceFingerprint: createSearchFingerprint(
        titleSource,
        key,
        `${ENCRYPTION_CONTEXT.glossarySource}:${titleDirection}`,
      ),
      targetTextEnc: encryptText("代表様", key, ENCRYPTION_CONTEXT.glossaryTarget),
      descriptionEnc: encryptText(
        "일반 대표 호칭",
        key,
        ENCRYPTION_CONTEXT.glossaryDescription,
      ),
      forbiddenTermsEnc: encryptJson(
        ["代表さん"],
        key,
        ENCRYPTION_CONTEXT.glossaryForbidden,
      ),
      isActive: true,
    },
  });

  await client.person.upsert({
    where: { id: "seed-person-ishiwatari" },
    create: {
      id: "seed-person-ishiwatari",
      japaneseCanonicalEnc: encryptText("石渡さん", key, ENCRYPTION_CONTEXT.personJapanese),
      koreanCanonicalEnc: encryptText("이시와타리님", key, ENCRYPTION_CONTEXT.personKorean),
      createdAt: seedDate,
    },
    update: {
      japaneseCanonicalEnc: encryptText("石渡さん", key, ENCRYPTION_CONTEXT.personJapanese),
      koreanCanonicalEnc: encryptText("이시와타리님", key, ENCRYPTION_CONTEXT.personKorean),
      isActive: true,
    },
  });

  for (const [id, alias] of [
    ["seed-alias-ishiwatari", "이시와타리 대표님"],
    ["seed-alias-ishiwatari-short", "이시와타리님"],
  ] as const) {
    await client.personAlias.upsert({
      where: { id },
      create: {
        id,
        personId: "seed-person-ishiwatari",
        aliasEnc: encryptText(alias, key, ENCRYPTION_CONTEXT.personAlias),
        aliasFingerprint: createSearchFingerprint(alias, key, ENCRYPTION_CONTEXT.personAlias),
        createdAt: seedDate,
      },
      update: {
        aliasEnc: encryptText(alias, key, ENCRYPTION_CONTEXT.personAlias),
        aliasFingerprint: createSearchFingerprint(alias, key, ENCRYPTION_CONTEXT.personAlias),
      },
    });
  }

  await client.toneRule.upsert({
    where: { id: "seed-tone-request" },
    create: {
      id: "seed-tone-request",
      situation: "요청",
      recommendedToneEnc: encryptText(
        "상대의 사정을 존중하는 정중한 업무 어조",
        key,
        ENCRYPTION_CONTEXT.toneRecommended,
      ),
      cushionPhrasesEnc: encryptJson(
        ["번거로우시겠지만"],
        key,
        ENCRYPTION_CONTEXT.toneCushion,
      ),
      forbiddenPhrasesEnc: encryptJson(
        ["당장 처리하세요"],
        key,
        ENCRYPTION_CONTEXT.toneForbidden,
      ),
      exampleEnc: encryptText(
        "번거로우시겠지만 확인 부탁드립니다.",
        key,
        ENCRYPTION_CONTEXT.toneExample,
      ),
      createdAt: seedDate,
    },
    update: {
      recommendedToneEnc: encryptText(
        "상대의 사정을 존중하는 정중한 업무 어조",
        key,
        ENCRYPTION_CONTEXT.toneRecommended,
      ),
      cushionPhrasesEnc: encryptJson(
        ["번거로우시겠지만"],
        key,
        ENCRYPTION_CONTEXT.toneCushion,
      ),
      forbiddenPhrasesEnc: encryptJson(
        ["당장 처리하세요"],
        key,
        ENCRYPTION_CONTEXT.toneForbidden,
      ),
      exampleEnc: encryptText(
        "번거로우시겠지만 확인 부탁드립니다.",
        key,
        ENCRYPTION_CONTEXT.toneExample,
      ),
      isActive: true,
    },
  });

  for (const prompt of [
    { id: "seed-prompt-openai-draft", provider: "openai", stage: "draft" },
    { id: "seed-prompt-gemini-review", provider: "gemini", stage: "review" },
  ]) {
    await client.promptVersion.upsert({
      where: { id: prompt.id },
      create: {
        ...prompt,
        version: "demo-v1",
        template: "Translate the user-provided business message using only the supplied rules.",
        createdAt: seedDate,
      },
      update: { isActive: true },
    });
  }

  await client.modelConfig.upsert({
    where: { id: "seed-model-openai-draft" },
    create: {
      id: "seed-model-openai-draft",
      provider: "openai",
      stage: "draft",
      modelId: "demo-openai-model",
      settings: JSON.stringify({ temperature: 0.2 }),
      effectiveFrom: seedDate,
      createdAt: seedDate,
    },
    update: { isActive: true },
  });

  await client.modelPrice.upsert({
    where: { id: "seed-price-openai-demo" },
    create: {
      id: "seed-price-openai-demo",
      provider: "openai",
      modelId: "demo-openai-model",
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      effectiveFrom: seedDate,
      createdAt: seedDate,
    },
    update: { inputPricePerMillion: 1, outputPricePerMillion: 2 },
  });

  const fakeSource = "이시와타리 대표님, Ontos 연습 계정 권한 확인을 부탁드립니다.";
  const fakeFinal = "石渡さん、Ontosの練習用アカウント権限をご確認いただけますでしょうか。";
  await client.translationJob.upsert({
    where: { id: "seed-job-demo-001" },
    create: {
      id: "seed-job-demo-001",
      sourceLanguage: "ko",
      targetLanguage: "ja",
      sourceTextEnc: encryptText(fakeSource, key, ENCRYPTION_CONTEXT.translationSource),
      finalTextEnc: encryptText(fakeFinal, key, ENCRYPTION_CONTEXT.translationFinal),
      status: "completed",
      promptVersionIds: JSON.stringify([
        "seed-prompt-openai-draft",
        "seed-prompt-gemini-review",
      ]),
      startedAt: seedDate,
      completedAt: seedDate,
    },
    update: {
      sourceTextEnc: encryptText(fakeSource, key, ENCRYPTION_CONTEXT.translationSource),
      finalTextEnc: encryptText(fakeFinal, key, ENCRYPTION_CONTEXT.translationFinal),
      status: "completed",
    },
  });

  await client.translationOutput.upsert({
    where: { id: "seed-output-demo-001" },
    create: {
      id: "seed-output-demo-001",
      jobId: "seed-job-demo-001",
      provider: "openai",
      stage: "draft",
      outputTextEnc: encryptText(fakeFinal, key, ENCRYPTION_CONTEXT.translationOutput),
      status: "completed",
      latencyMs: 420,
      createdAt: seedDate,
    },
    update: {
      outputTextEnc: encryptText(fakeFinal, key, ENCRYPTION_CONTEXT.translationOutput),
      status: "completed",
    },
  });

  await client.appliedRuleSnapshot.upsert({
    where: { id: "seed-snapshot-demo-001" },
    create: {
      id: "seed-snapshot-demo-001",
      jobId: "seed-job-demo-001",
      ruleType: "glossary",
      ruleId: "seed-glossary-ontos",
      ruleVersion: 1,
      snapshotEnc: encryptJson(
        { source: glossarySource, target: "Ontos（IAM）" },
        key,
        ENCRYPTION_CONTEXT.ruleSnapshot,
      ),
      createdAt: seedDate,
    },
    update: {
      snapshotEnc: encryptJson(
        { source: glossarySource, target: "Ontos（IAM）" },
        key,
        ENCRYPTION_CONTEXT.ruleSnapshot,
      ),
    },
  });

  await client.apiUsage.upsert({
    where: { id: "seed-usage-demo-001" },
    create: {
      id: "seed-usage-demo-001",
      jobId: "seed-job-demo-001",
      provider: "openai",
      modelId: "demo-openai-model",
      stage: "draft",
      inputTokens: 34,
      outputTokens: 28,
      estimatedCostUsd: 0.00009,
      occurredAt: seedDate,
    },
    update: { inputTokens: 34, outputTokens: 28, estimatedCostUsd: 0.00009 },
  });

  await client.operationLog.upsert({
    where: { id: "seed-operation-demo-001" },
    create: {
      id: "seed-operation-demo-001",
      category: "database",
      action: "seed",
      targetType: "demo-data",
      targetId: "seed-v1",
      result: "success",
      safeMessage: "연습용 자료 초기화 완료",
      createdAt: seedDate,
    },
    update: { result: "success", safeMessage: "연습용 자료 초기화 완료" },
  });

  await client.deletionLog.upsert({
    where: { id: "seed-deletion-demo-001" },
    create: {
      id: "seed-deletion-demo-001",
      dateFrom: seedDate,
      dateTo: seedDate,
      deletedJobCount: 0,
      deletedAt: seedDate,
    },
    update: { deletedJobCount: 0 },
  });

  await client.appSetting.upsert({
    where: { key: "data-policy" },
    create: {
      key: "data-policy",
      valueJson: JSON.stringify({ dataMode: "demo", retentionDays: 30 }),
      updatedAt: seedDate,
    },
    update: { valueJson: JSON.stringify({ dataMode: "demo", retentionDays: 30 }) },
  });
}

async function main() {
  const client = new PrismaClient();

  try {
    await seedDatabase(client);
    console.info("연습용 용어·인명·말투·메시지 데이터가 준비되었습니다.");
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "시드 데이터 준비에 실패했습니다.");
    process.exitCode = 1;
  });
}
