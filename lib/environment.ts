import { isValidEncryptionKey } from "@/lib/crypto";

export const REQUIRED_SECRET_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DATA_ENCRYPTION_KEY",
] as const;

type SecretKey = (typeof REQUIRED_SECRET_KEYS)[number];

export type EnvironmentStatus = {
  ready: boolean;
  missing: SecretKey[];
  invalid: SecretKey[];
  dataMode: "demo" | "real";
};

export function getEnvironmentStatus(
  environment: Record<string, string | undefined> = process.env,
): EnvironmentStatus {
  const missing = REQUIRED_SECRET_KEYS.filter((key) => !environment[key]?.trim());
  const invalid = environment.DATA_ENCRYPTION_KEY?.trim() &&
    !isValidEncryptionKey(environment.DATA_ENCRYPTION_KEY)
    ? (["DATA_ENCRYPTION_KEY"] as SecretKey[])
    : [];

  return {
    ready: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    dataMode: environment.DATA_MODE === "real" ? "real" : "demo",
  };
}
