import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

function hasSetting(contents: string, name: string): boolean {
  return new RegExp(`^${name}=`, "m").test(contents);
}

export function ensureLocalEnvironment(root = process.cwd()): {
  path: string;
  encryptionKeyCreated: boolean;
} {
  const path = resolve(root, ".env.local");
  let contents = existsSync(path) ? readFileSync(path, "utf8").trimEnd() : "";
  const originalContents = contents;
  contents = contents.replace(
    /^DATABASE_URL=["']?file:\.\/prisma\/dev\.db["']?$/m,
    'DATABASE_URL="file:./dev.db"',
  );
  const additions: string[] = [];
  let encryptionKeyCreated = false;

  if (!hasSetting(contents, "DATABASE_URL")) {
    additions.push('DATABASE_URL="file:./dev.db"');
  }
  if (!hasSetting(contents, "OPENAI_API_KEY")) {
    additions.push("OPENAI_API_KEY=");
  }
  if (!hasSetting(contents, "GEMINI_API_KEY")) {
    additions.push("GEMINI_API_KEY=");
  }
  const encryptionKeyLine = contents.match(/^DATA_ENCRYPTION_KEY=(.*)$/m);
  if (!encryptionKeyLine || !encryptionKeyLine[1].replace(/["']/g, "").trim()) {
    const newKeyLine = `DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`;
    if (encryptionKeyLine) {
      contents = contents.replace(/^DATA_ENCRYPTION_KEY=.*$/m, newKeyLine);
    } else {
      additions.push(newKeyLine);
    }
    encryptionKeyCreated = true;
  }
  if (!hasSetting(contents, "DATA_MODE")) {
    additions.push("DATA_MODE=demo");
  }

  if (additions.length > 0 || contents !== originalContents) {
    contents = [contents, ...additions].filter(Boolean).join("\n");
    writeFileSync(path, `${contents}\n`, { encoding: "utf8", mode: 0o600 });
  }

  return { path, encryptionKeyCreated };
}

export function ensureSqliteDatabaseFile(databaseUrl: string, root = process.cwd()): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("SQLite 데이터베이스 주소는 file: 형식이어야 합니다.");
  }

  const urlPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
  const path = isAbsolute(urlPath) ? urlPath : resolve(root, "prisma", urlPath);
  mkdirSync(dirname(path), { recursive: true });

  if (!existsSync(path)) {
    closeSync(openSync(path, "a"));
  }

  return path;
}
