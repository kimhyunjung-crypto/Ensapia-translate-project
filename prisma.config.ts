import { config as loadEnvironmentFile } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnvironmentFile({ path: ".env.local", quiet: true });
loadEnvironmentFile({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
