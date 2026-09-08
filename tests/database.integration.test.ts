// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
import { createPrismaClient } from "@/lib/database";
import { getDatabaseHealth } from "@/lib/database-health";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { reviewOutputSchema } from "@/modules/ai/schemas";
import { GlossaryRepository } from "@/modules/glossary/repository";
import { PeopleRepository } from "@/modules/people/repository";
import { ToneRepository } from "@/modules/tone/repository";
import { prepareFirstPassProviderRequests } from "@/modules/translation/provider-inputs";
import { TranslationRepository } from "@/modules/translation/repository";
import { executeTranslation } from "@/modules/translation/service";
import { seedDatabase } from "@/prisma/seed";

const require = createRequire(import.meta.url);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "ensapia-epic2-"));
const databasePath = join(temporaryDirectory, "integration.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const encryptionKey = randomBytes(32);
let client: PrismaClient;

describe("EPIC 2 database foundation", () => {
  beforeAll(async () => {
    // Prisma's Windows schema engine expects the SQLite file to exist before deploy.
    writeFileSync(databasePath, "");
    execFileSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      },
    );
    client = createPrismaClient(databaseUrl);
    await seedDatabase(client, encryptionKey);
  }, 30_000);

  afterAll(async () => {
    await client?.$disconnect();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("creates and reads all 14 tables with fake seed data", async () => {
    const health = await getDatabaseHealth(client, encryptionKey);

    expect(health.connected).toBe(true);
    expect(health.tableCount).toBe(14);
    expect(Object.values(health.counts).every((count) => count > 0)).toBe(true);
    expect(health.samples.glossary).toContain("Ontos");
    expect(health.samples.person).toContain("이시와타리");
    expect(health.samples.tone).toContain("요청");
    expect(health.samples.message).toContain("연습 계정");
  });

  it("supports feature-level repository create and read operations", async () => {
    const glossary = new GlossaryRepository(client, encryptionKey);
    const people = new PeopleRepository(client, encryptionKey);
    const tone = new ToneRepository(client, encryptionKey);
    const translations = new TranslationRepository(client, encryptionKey);

    await glossary.create({
      sourceText: "DemoFlow",
      targetText: "DemoFlow（検証）",
      direction: "ko-ja",
      description: "가상 용어",
      forbiddenTerms: [],
    });
    await people.create({
      japaneseCanonical: "山田さん",
      koreanCanonical: "야마다님",
      aliases: ["야마다 담당자님"],
    });
    await tone.create({
      situation: "검토",
      recommendedTone: "정중하고 간결한 감사",
      cushionPhrases: [],
      forbiddenPhrases: [],
    });
    await translations.create({
      sourceText: "가상 점검 메시지입니다.",
      sourceLanguage: "ko",
      targetLanguage: "ja",
      finalText: "仮想の確認メッセージです。",
      status: "completed",
    });

    expect((await glossary.list()).some((item) => item.sourceText === "DemoFlow")).toBe(true);
    expect((await people.list()).some((item) => item.koreanCanonical === "야마다님")).toBe(true);
    expect((await tone.list()).some((item) => item.situation === "감사")).toBe(true);
    expect((await translations.latest())?.sourceText).toBe("가상 점검 메시지입니다.");
    expect((await getDatabaseHealth(client, encryptionKey)).samples.message).toContain("연습 계정");
  });

  it("loads encrypted rules and prepares identical provider inputs in priority order", async () => {
    const sourceText = "이시와타리 대표님, Ontos 연습 계정 권한 확인을 부탁드립니다.";
    const requests = await prepareFirstPassProviderRequests(
      sourceText,
      "ko-ja",
      client,
      encryptionKey,
    );

    expect(requests.openai.input).toEqual(requests.gemini.input);
    expect(requests.openai.input.sourceText).toBe(sourceText);
    expect(requests.openai.input.rules.map((rule) => [rule.type, rule.priority])).toEqual([
      ["person", 1],
      ["glossary", 2],
      ["tone", 3],
    ]);
    expect(requests.openai.input.rules).toContainEqual(
      expect.objectContaining({
        ruleId: "seed-person-ishiwatari",
        requiredText: "石渡さん",
      }),
    );
    expect(requests.openai.input.rules).toContainEqual(
      expect.objectContaining({
        ruleId: "seed-glossary-ontos",
        requiredText: "Ontos（IAM）",
      }),
    );
    expect(requests.openai.input.rules).not.toContainEqual(
      expect.objectContaining({ ruleId: "seed-glossary-title" }),
    );
  });

  it("creates, updates, filters, audits, deactivates, and safely deletes glossary terms", async () => {
    const glossary = new GlossaryRepository(client, encryptionKey);
    const created = await glossary.create({
      sourceText: "EpicSixTerm",
      targetText: "EPIC6用語",
      direction: "ko-ja",
      description: "EPIC 6 변경 기록 점검",
      forbiddenTerms: ["에픽식스"],
      isActive: true,
    });

    const updated = await glossary.update(created.id, {
      sourceText: created.sourceText,
      targetText: "EPIC6推奨用語",
      direction: created.direction,
      description: "수정된 설명",
      forbiddenTerms: created.forbiddenTerms,
      isActive: true,
    });
    expect(updated.targetText).toBe("EPIC6推奨用語");
    expect(updated.updatedAt?.getTime()).toBeGreaterThanOrEqual(created.updatedAt?.getTime() ?? 0);

    const history = await glossary.history(created.id);
    expect(history.map((entry) => entry.action)).toEqual(["updated", "created"]);
    expect(history[0].changedFields).toEqual(["권장 표기", "설명"]);
    expect(history[0].before?.targetText).toBe("EPIC6用語");
    expect(history[0].after?.targetText).toBe("EPIC6推奨用語");

    await glossary.setActive(created.id, false);
    const inactiveRequests = await prepareFirstPassProviderRequests(
      "EpicSixTerm 확인을 부탁드립니다.",
      "ko-ja",
      client,
      encryptionKey,
    );
    expect(inactiveRequests.openai.input.rules).not.toContainEqual(
      expect.objectContaining({ ruleId: created.id }),
    );

    await glossary.setActive(created.id, true);
    const activeRequests = await prepareFirstPassProviderRequests(
      "EpicSixTerm 확인을 부탁드립니다.",
      "ko-ja",
      client,
      encryptionKey,
    );
    expect(activeRequests.openai.input.rules).toContainEqual(
      expect.objectContaining({ ruleId: created.id, requiredText: "EPIC6推奨用語" }),
    );

    await client.glossaryTerm.update({ where: { id: created.id }, data: { usedCount: 1 } });
    await expect(glossary.deleteUnused(created.id)).rejects.toMatchObject({
      code: "GLOSSARY_TERM_IN_USE",
    });
    expect(await glossary.setActive(created.id, false)).toMatchObject({ isActive: false });

    const disposable = await glossary.create({
      sourceText: "DisposableEpicSix",
      targetText: "削除可能",
      direction: "ko-ja",
      forbiddenTerms: [],
    });
    await glossary.deleteUnused(disposable.id);
    expect(await glossary.findById(disposable.id)).toBeNull();
  });

  it("rejects duplicate glossary source text in the same direction", async () => {
    const glossary = new GlossaryRepository(client, encryptionKey);
    await expect(
      glossary.create({
        sourceText: "  ontos  ",
        targetText: "중복",
        direction: "ko-ja",
        forbiddenTerms: [],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_GLOSSARY_TERM" });
  });

  it("creates, edits, deactivates, and safely deletes bidirectional person rules", async () => {
    const people = new PeopleRepository(client, encryptionKey);
    const created = await people.create({
      japaneseCanonical: "佐藤さん",
      koreanCanonical: "사토님",
      aliases: ["사토 담당자님", " 사토 담당자님 ", "사토상"],
      isActive: true,
    });
    expect(created.aliases).toEqual(["사토 담당자님", "사토상"]);

    const updated = await people.update(created.id, {
      japaneseCanonical: "佐藤部長",
      koreanCanonical: "사토 부장님",
      aliases: ["사토 부장님", "사토부장"],
      isActive: true,
    });
    expect(updated).toMatchObject({
      japaneseCanonical: "佐藤部長",
      koreanCanonical: "사토 부장님",
      aliases: ["사토 부장님", "사토부장"],
    });

    const koreanToJapanese = await prepareFirstPassProviderRequests(
      "사토부장께 확인을 부탁드립니다.",
      "ko-ja",
      client,
      encryptionKey,
    );
    expect(koreanToJapanese.openai.input.rules).toContainEqual(
      expect.objectContaining({ ruleId: created.id, requiredText: "佐藤部長" }),
    );
    const japaneseToKorean = await prepareFirstPassProviderRequests(
      "佐藤部長、ご確認をお願いします。",
      "ja-ko",
      client,
      encryptionKey,
    );
    expect(japaneseToKorean.openai.input.rules).toContainEqual(
      expect.objectContaining({ ruleId: created.id, requiredText: "사토 부장님" }),
    );

    await people.setActive(created.id, false);
    const inactive = await prepareFirstPassProviderRequests(
      "사토부장께 확인을 부탁드립니다.",
      "ko-ja",
      client,
      encryptionKey,
    );
    expect(inactive.openai.input.rules).not.toContainEqual(
      expect.objectContaining({ ruleId: created.id }),
    );

    await expect(
      people.create({
        japaneseCanonical: "중복 일본어",
        koreanCanonical: "중복 한국어",
        aliases: ["  사토부장  "],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_PERSON_ALIAS" });

    await client.person.update({ where: { id: created.id }, data: { usedCount: 1 } });
    await expect(people.deleteUnused(created.id)).rejects.toMatchObject({ code: "PERSON_RULE_IN_USE" });

    const disposable = await people.create({
      japaneseCanonical: "削除可能さん",
      koreanCanonical: "삭제 가능님",
      aliases: ["삭제 가능한 별칭"],
    });
    await people.deleteUnused(disposable.id);
    expect(await people.findById(disposable.id)).toBeNull();
  });

  it("manages versioned tone rules and applies only active rules to AI inputs", async () => {
    const tone = new ToneRepository(client, encryptionKey);
    const standardSituations = (await tone.list()).map((rule) => rule.situation);
    expect(standardSituations).toEqual(
      expect.arrayContaining(["인사", "요청", "거절", "사과", "독촉", "확인", "감사"]),
    );

    const created = await tone.create({
      situation: "공유",
      recommendedTone: "EPIC 8 정중 공유 어조",
      cushionPhrases: ["참고 부탁드립니다", " 참고 부탁드립니다 "],
      forbiddenPhrases: ["꼭 보세요"],
      example: "참고하실 내용을 공유드립니다.",
      isActive: true,
    });
    expect(created).toMatchObject({
      cushionPhrases: ["참고 부탁드립니다"],
      version: 1,
      isActive: true,
    });

    const updated = await tone.update(created.id, {
      situation: created.situation,
      recommendedTone: "EPIC 8 배려하는 공유 어조",
      cushionPhrases: created.cushionPhrases,
      forbiddenPhrases: created.forbiddenPhrases,
      example: "참고 부탁드리며 관련 내용을 공유드립니다.",
      isActive: true,
    });
    expect(updated.version).toBe(2);

    const history = await tone.history(created.id);
    expect(history.map((entry) => entry.action)).toEqual(["updated", "created"]);
    expect(history[0].changedFields).toEqual(["권장 어조", "예문"]);
    expect(history[0].before?.recommendedTone).toBe("EPIC 8 정중 공유 어조");
    expect(history[0].after?.recommendedTone).toBe("EPIC 8 배려하는 공유 어조");

    const activeRequests = await prepareFirstPassProviderRequests(
      "공유 내용을 전달드립니다.",
      "ko-ja",
      client,
      encryptionKey,
    );
    expect(activeRequests.openai.input.rules).toContainEqual(
      expect.objectContaining({
        type: "tone",
        ruleId: created.id,
        version: 2,
        recommendedTone: "EPIC 8 배려하는 공유 어조",
      }),
    );

    const deactivated = await tone.setActive(created.id, false);
    expect(deactivated).toMatchObject({ isActive: false, version: 3 });
    const inactiveRequests = await prepareFirstPassProviderRequests(
      "공유 내용을 전달드립니다.",
      "ko-ja",
      client,
      encryptionKey,
    );
    expect(inactiveRequests.openai.input.rules).not.toContainEqual(
      expect.objectContaining({ ruleId: created.id }),
    );
    expect((await tone.history(created.id))[0]).toMatchObject({
      action: "deactivated",
      changedFields: ["사용 상태"],
      version: 3,
    });

    await expect(
      tone.create({
        situation: "  공유  ",
        recommendedTone: "중복 규칙",
        cushionPhrases: [],
        forbiddenPhrases: [],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_TONE_SITUATION" });

    await client.toneRule.update({ where: { id: created.id }, data: { usedCount: 1 } });
    await expect(tone.deleteUnused(created.id)).rejects.toMatchObject({ code: "TONE_RULE_IN_USE" });
    expect(await tone.findById(created.id)).toMatchObject({ isActive: false, usedCount: 1 });

    const disposable = await tone.create({
      situation: "삭제용 안내",
      recommendedTone: "삭제 가능한 말투",
      cushionPhrases: [],
      forbiddenPhrases: [],
    });
    await tone.deleteUnused(disposable.id);
    expect(await tone.findById(disposable.id)).toBeNull();
  });

  it("stores five pipeline outputs, structured reviews, timing, usage, and rules encrypted", async () => {
    const sourceText = "이시와타리 대표님, Ontos 연습 계정 권한 확인을 부탁드립니다.";
    const beforeCount = await client.translationJob.count();
    const translation = await executeTranslation(sourceText, {
      client,
      key: encryptionKey,
      mode: "demo",
    });
    const job = await client.translationJob.findFirst({
      where: { outputs: { some: { stage: "final" } } },
      orderBy: { startedAt: "desc" },
      include: { outputs: true, ruleSnapshots: true, apiUsage: true },
    });

    expect(translation.finalText).toBe(
      "石渡さん、Ontos（IAM）の練習用アカウント権限をご確認いただけますでしょうか。",
    );
    expect(await client.translationJob.count()).toBe(beforeCount + 1);
    expect(job).not.toBeNull();
    expect(job?.status).toBe("completed");
    expect(
      decryptText(job?.finalTextEnc ?? "", encryptionKey, ENCRYPTION_CONTEXT.translationFinal),
    ).toBe(translation.finalText);
    expect(job?.outputs).toHaveLength(5);
    expect(job?.apiUsage).toHaveLength(5);
    expect(job?.ruleSnapshots.map((snapshot) => snapshot.ruleType)).toEqual([
      "person",
      "glossary",
      "tone",
    ]);
    expect(JSON.parse(job?.promptVersionIds ?? "[]")).toHaveLength(5);

    const reviewOutputs = job?.outputs.filter((output) => output.stage === "review") ?? [];
    expect(reviewOutputs).toHaveLength(2);
    for (const output of reviewOutputs) {
      const decrypted = decryptText(
        output.outputTextEnc,
        encryptionKey,
        ENCRYPTION_CONTEXT.translationOutput,
      );
      expect(() => reviewOutputSchema.parse(JSON.parse(decrypted))).not.toThrow();
    }

    const draftOutputs = job?.outputs.filter((output) => output.stage === "draft") ?? [];
    expect(draftOutputs).toHaveLength(2);
    const [firstDraft, secondDraft] = draftOutputs;
    const firstEnd = firstDraft.createdAt.getTime() + (firstDraft.latencyMs ?? 0);
    const secondEnd = secondDraft.createdAt.getTime() + (secondDraft.latencyMs ?? 0);
    expect(firstDraft.createdAt.getTime()).toBeLessThan(secondEnd);
    expect(secondDraft.createdAt.getTime()).toBeLessThan(firstEnd);
  });

  it("keeps fake company, person, and message plaintext out of SQLite", () => {
    const rawDatabase = readFileSync(databasePath).toString("utf8");

    for (const plaintext of [
      "Ontos",
      "대표님",
      "代表様",
      "이시와타리",
      "石渡さん",
      "연습 계정 권한",
      "DemoFlow",
      "야마다 담당자님",
      "가상 점검 메시지입니다.",
      "EpicSixTerm",
      "EPIC6推奨用語",
      "EPIC 6 변경 기록 점검",
      "DisposableEpicSix",
      "佐藤部長",
      "사토 부장님",
      "사토부장",
      "削除可能さん",
      "삭제 가능한 별칭",
      "EPIC 8 정중 공유 어조",
      "EPIC 8 배려하는 공유 어조",
      "참고 부탁드립니다",
      "꼭 보세요",
      "참고하실 내용을 공유드립니다.",
      "참고 부탁드리며 관련 내용을 공유드립니다.",
      "삭제 가능한 말투",
    ]) {
      expect(rawDatabase).not.toContain(plaintext);
    }
  });
});
