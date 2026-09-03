import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

export function createPrismaClient(url = databaseUrl): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const prismaGlobal = globalThis as typeof globalThis & {
  ensapiaPrisma?: PrismaClient;
};

export const prisma = prismaGlobal.ensapiaPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.ensapiaPrisma = prisma;
}
