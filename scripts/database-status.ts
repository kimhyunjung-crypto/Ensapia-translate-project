import { config as loadEnvironmentFile } from "dotenv";

loadEnvironmentFile({ path: ".env.local", quiet: true });
loadEnvironmentFile({ path: ".env", quiet: true });

async function main() {
  const [{ prisma }, { getDatabaseHealth, DATABASE_TABLE_LABELS }] = await Promise.all([
    import("../lib/database"),
    import("../lib/database-health"),
  ]);

  try {
    const health = await getDatabaseHealth(prisma);
    console.info(`SQLite 연결 성공 · ${health.tableCount}개 데이터 표`);
    for (const [name, count] of Object.entries(health.counts)) {
      console.info(`${DATABASE_TABLE_LABELS[name as keyof typeof DATABASE_TABLE_LABELS]}: ${count}건`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "데이터 연결 점검에 실패했습니다.");
  process.exitCode = 1;
});
