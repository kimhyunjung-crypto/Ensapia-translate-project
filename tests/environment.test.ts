import { describe, expect, it } from "vitest";
import { getEnvironmentStatus, REQUIRED_SECRET_KEYS } from "@/lib/environment";

describe("getEnvironmentStatus", () => {
  it("reports every missing secret without returning secret values", () => {
    const status = getEnvironmentStatus({ DATA_MODE: "demo" });

    expect(status).toEqual({
      ready: false,
      missing: [...REQUIRED_SECRET_KEYS],
      invalid: [],
      dataMode: "demo",
    });
    expect(JSON.stringify(status)).not.toContain("secret-value");
  });

  it("becomes ready when all required values exist", () => {
    const status = getEnvironmentStatus({
      OPENAI_API_KEY: "openai-secret-value",
      GEMINI_API_KEY: "gemini-secret-value",
      DATA_ENCRYPTION_KEY: "a".repeat(64),
      DATA_MODE: "real",
    });

    expect(status).toEqual({ ready: true, missing: [], invalid: [], dataMode: "real" });
    expect(JSON.stringify(status)).not.toContain("secret-value");
  });

  it("uses demo mode unless real mode is explicitly selected", () => {
    expect(getEnvironmentStatus({ DATA_MODE: "REAL" }).dataMode).toBe("demo");
    expect(getEnvironmentStatus({ DATA_MODE: "unexpected" }).dataMode).toBe("demo");
  });

  it("reports an encryption key with the wrong byte length", () => {
    const status = getEnvironmentStatus({
      OPENAI_API_KEY: "configured",
      GEMINI_API_KEY: "configured",
      DATA_ENCRYPTION_KEY: "too-short",
    });

    expect(status.ready).toBe(false);
    expect(status.missing).toEqual([]);
    expect(status.invalid).toEqual(["DATA_ENCRYPTION_KEY"]);
  });
});
