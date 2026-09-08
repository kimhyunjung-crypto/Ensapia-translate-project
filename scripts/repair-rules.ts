import { PrismaClient } from "@prisma/client";
import { config as loadEnvironmentFile } from "dotenv";
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decodeEncryptionKey } from "../lib/crypto";
import { isOpeningGreetingSituation, OPENING_GREETING_SITUATION } from "../modules/rules/opening-greeting";
import { ToneRepository } from "../modules/tone/repository";

export async function repairMissingRules(
  environment: Record<string, string | undefined> = process.env,
  root = process.cwd(),
): Promise<{ created: boolean; isActive: boolean; ruleId: string }> {
  const databaseUrl = environment.DATABASE_URL?.trim() || "file:./dev.db";
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL은 기존 SQLite 파일을 가리키는 file: 주소여야 합니다.");
  }
  const urlPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
  const databasePath = isAbsolute(urlPath) ? urlPath : resolve(root, "prisma", urlPath);
  if (!statSync(databasePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("기존 DB 파일을 찾을 수 없습니다. DATABASE_URL을 확인해 주세요. 새 DB는 만들지 않았습니다.");
  }

  if (!environment.DATA_ENCRYPTION_KEY?.trim()) {
    throw new Error("DATA_ENCRYPTION_KEY가 없습니다. 기존 DB의 암호화 키를 설정해 주세요. 새 키는 만들지 않습니다.");
  }
  const key = decodeEncryptionKey(environment.DATA_ENCRYPTION_KEY);
  const client = new PrismaClient({
    datasources: { db: { url: `file:${databasePath.replaceAll("\\", "/")}` } },
  });

  try {
    const repository = new ToneRepository(client, key);
    // Read and decrypt existing rules before writing, and preserve normalized names too.
    const existing = (await repository.list()).find((rule) => isOpeningGreetingSituation(rule.situation));
    if (existing) {
      return { created: false, isActive: existing.isActive, ruleId: existing.id };
    }

    const rule = await repository.create({
      situation: OPENING_GREETING_SITUATION,
      recommendedTone: "메시지 첫머리의 업무 인사를 방향별 필수 표기로 변환",
      cushionPhrases: [],
      forbiddenPhrases: ["こんにちは", "いつもお世話になっております", "수고하십니다", "수고 많으십니다"],
      example: "안녕하세요. → お疲れ様です。 / お疲れ様です。 → 안녕하세요.",
      isActive: true,
    });
    return { created: true, isActive: rule.isActive, ruleId: rule.id };
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  loadEnvironmentFile({ path: ".env.local", quiet: true });
  loadEnvironmentFile({ path: ".env", quiet: true });
  const result = await repairMissingRules();
  console.info(result.created
    ? "복구 완료: 누락된 ‘첫인사’를 사용 중 상태로 등록했습니다. 기존 규칙과 데이터는 유지했습니다."
    : `변경 없음: ‘첫인사’가 이미 등록되어 있습니다. 기존 ${result.isActive ? "사용 중" : "사용 중지"} 상태를 유지했습니다.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "필수 규칙 복구에 실패했습니다.");
    process.exitCode = 1;
  });
}
