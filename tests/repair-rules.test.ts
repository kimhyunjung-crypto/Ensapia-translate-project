// @vitest-environment node
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ToneRepository } from "@/modules/tone/repository";
import { prepareFirstPassProviderRequests } from "@/modules/translation/provider-inputs";
import { seedDatabase } from "@/prisma/seed";
import { repairMissingRules } from "@/scripts/repair-rules";

const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), "ensapia-repair-rules-"));
const databasePath = join(directory, "repair.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const key = randomBytes(32);
const environment = { DATABASE_URL: databaseUrl, DATA_ENCRYPTION_KEY: key.toString("hex") };
let client: PrismaClient;

async function snapshot(): Promise<Record<string, Array<{ id?: string }>>> {
  const tables = await client.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name
  `;
  return Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [
    name,
    await client.$queryRawUnsafe<Array<{ id?: string }>>(
      `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
    ),
  ])));
}

describe("missing rule repair on an existing database", () => {
  beforeAll(async () => {
    writeFileSync(databasePath, "");
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seedDatabase(client, key);
    await new ToneRepository(client, key).update("seed-tone-request", {
      situation: "요청",
      recommendedTone: "사용자가 수정한 요청 규칙",
      cushionPhrases: ["사용자 지정 쿠션어"],
      forbiddenPhrases: ["사용자 지정 금지 표현"],
      isActive: false,
    });
  }, 30_000);

  beforeEach(async () => {
    await client.toneRule.deleteMany({ where: { situation: { in: ["첫인사", "첫 인사"] } } });
  });

  afterAll(async () => {
    await client?.$disconnect();
    const target = resolve(directory);
    if (!target.startsWith(`${resolve(tmpdir())}\\`) && !target.startsWith(`${resolve(tmpdir())}/`)) {
      throw new Error("Test cleanup target is outside the temporary directory.");
    }
    rmSync(target, { recursive: true, force: true });
  });

  it("adds only the missing active rule and its audit entry, then makes no changes on rerun", async () => {
    const before = await snapshot();
    const result = await repairMissingRules(environment);
    expect(result).toMatchObject({ created: true, isActive: true });
    const after = await snapshot();
    expect(after.tone_rules).toHaveLength(before.tone_rules.length + 1);
    expect(after.operation_logs).toHaveLength(before.operation_logs.length + 1);
    expect(after.tone_rules.filter((row) => row.id !== result.ruleId)).toEqual(before.tone_rules);
    expect(after.operation_logs.slice(0, before.operation_logs.length)).toEqual(before.operation_logs);
    for (const table of Object.keys(before).filter((name) => !["tone_rules", "operation_logs"].includes(name))) {
      expect(after[table], table).toEqual(before[table]);
    }

    for (const [source, direction, requiredText] of [
      ["안녕하세요. 자료 확인을 부탁드립니다.", "ko-ja", "お疲れ様です。"],
      ["お疲れ様です。資料をご確認ください。", "ja-ko", "안녕하세요."],
    ] as const) {
      const requests = await prepareFirstPassProviderRequests(source, direction, client, key);
      expect(requests.openai.input.rules[0]).toMatchObject({ type: "hard", priority: 0, requiredText });
      expect(requests.gemini.input).toEqual(requests.openai.input);
    }

    expect(await repairMissingRules(environment)).toEqual({ ...result, created: false });
    expect(await snapshot()).toEqual(after);
  });

  it.each([
    ["첫인사", true],
    ["첫인사", false],
    ["첫 인사", false],
  ])("preserves an existing %s rule with active=%s including encrypted values", async (situation, isActive) => {
    const rule = await new ToneRepository(client, key).create({
      situation,
      recommendedTone: "사용자가 작성한 첫인사 설명",
      cushionPhrases: ["사용자 지정 문구"],
      forbiddenPhrases: [],
      example: "사용자가 작성한 예문",
      isActive,
    });
    const before = await snapshot();
    expect(await repairMissingRules(environment)).toEqual({ created: false, isActive, ruleId: rule.id });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a missing database without creating a file", async () => {
    const missingPath = join(directory, "missing.db");
    await expect(repairMissingRules({ ...environment, DATABASE_URL: "file:./missing.db" }, directory))
      .rejects.toThrow("기존 DB 파일을 찾을 수 없습니다");
    expect(existsSync(missingPath)).toBe(false);
    expect(existsSync(join(directory, "prisma", "missing.db"))).toBe(false);
  });

  it.each([undefined, "invalid-key", randomBytes(32).toString("hex")])(
    "refuses missing, malformed, or mismatched keys before changing data (case %#)",
    async (encryptionKey) => {
      const before = await snapshot();
      await expect(repairMissingRules({ ...environment, DATA_ENCRYPTION_KEY: encryptionKey }))
        .rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    },
  );
});
