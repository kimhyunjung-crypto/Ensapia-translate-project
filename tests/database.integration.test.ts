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
      situation: "감사",
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
    ]) {
      expect(rawDatabase).not.toContain(plaintext);
    }
  });
});
