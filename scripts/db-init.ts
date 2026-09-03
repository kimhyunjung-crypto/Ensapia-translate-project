import { spawnSync } from "node:child_process";
import { config as loadEnvironmentFile } from "dotenv";
import { ensureLocalEnvironment, ensureSqliteDatabaseFile } from "./setup-local-environment";

function runPrisma(arguments_: string[]): void {
  const result = spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), ...arguments_],
    { stdio: "inherit", env: process.env },
  );

  if (result.status !== 0) {
    throw new Error(`Prisma ${arguments_.join(" ")} 명령이 실패했습니다.`);
  }
}

async function main() {
  const setup = ensureLocalEnvironment();
  loadEnvironmentFile({ path: setup.path, quiet: true });
  ensureSqliteDatabaseFile(process.env.DATABASE_URL ?? "file:./dev.db");

  runPrisma(["migrate", "deploy"]);

  const [{ createPrismaClient }, { decodeEncryptionKey }, { seedDatabase }, { getDatabaseHealth }] =
    await Promise.all([
      import("../lib/database"),
      import("../lib/crypto"),
      import("../prisma/seed"),
      import("../lib/database-health"),
    ]);
  const client = createPrismaClient(process.env.DATABASE_URL);

  try {
    await seedDatabase(client, decodeEncryptionKey());
    const health = await getDatabaseHealth(client, decodeEncryptionKey());
    console.info(
      `초기화 성공: SQLite 연결 및 ${health.tableCount}개 데이터 표, 연습용 자료가 준비되었습니다.`,
    );
    if (setup.encryptionKeyCreated) {
      console.info("새 암호화 키를 .env.local에 만들었습니다. 키 값은 화면에 출력하지 않습니다.");
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "데이터 초기화에 실패했습니다.");
  process.exitCode = 1;
});
