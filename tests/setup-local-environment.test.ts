// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isValidEncryptionKey } from "@/lib/crypto";
import {
  ensureLocalEnvironment,
  ensureSqliteDatabaseFile,
} from "@/scripts/setup-local-environment";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local database setup", () => {
  it("fills an empty encryption key and upgrades the old database path", () => {
    const directory = mkdtempSync(join(tmpdir(), "ensapia-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, ".env.local"),
      'DATABASE_URL="file:./prisma/dev.db"\nDATA_ENCRYPTION_KEY=\n',
    );

    const result = ensureLocalEnvironment(directory);
    const contents = readFileSync(result.path, "utf8");
    const key = contents.match(/^DATA_ENCRYPTION_KEY=(.+)$/m)?.[1];

    expect(result.encryptionKeyCreated).toBe(true);
    expect(contents).toContain('DATABASE_URL="file:./dev.db"');
    expect(isValidEncryptionKey(key)).toBe(true);
  });

  it("keeps the same generated key when initialization is repeated", () => {
    const directory = mkdtempSync(join(tmpdir(), "ensapia-env-"));
    temporaryDirectories.push(directory);

    const first = ensureLocalEnvironment(directory);
    const firstContents = readFileSync(first.path, "utf8");
    const second = ensureLocalEnvironment(directory);
    const secondContents = readFileSync(second.path, "utf8");

    expect(first.encryptionKeyCreated).toBe(true);
    expect(second.encryptionKeyCreated).toBe(false);
    expect(secondContents).toBe(firstContents);
  });

  it("creates the default SQLite file before Prisma migration on Windows", () => {
    const directory = mkdtempSync(join(tmpdir(), "ensapia-env-"));
    temporaryDirectories.push(directory);

    const databasePath = ensureSqliteDatabaseFile("file:./dev.db", directory);

    expect(databasePath).toBe(join(directory, "prisma", "dev.db"));
    expect(readFileSync(databasePath)).toHaveLength(0);
  });
});
