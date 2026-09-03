import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSearchFingerprint,
  decodeEncryptionKey,
  decryptJson,
  decryptText,
  EncryptedDataError,
  EncryptionConfigurationError,
  encryptJson,
  encryptText,
} from "@/lib/crypto";

describe("AES-256-GCM data protection", () => {
  const key = randomBytes(32);

  it("round-trips Korean and Japanese text without storing plaintext", () => {
    const plaintext = "가상 담당자님、確認をお願いします。";
    const encrypted = encryptText(plaintext, key, "test.message");

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted).toMatch(/^v1\./);
    expect(decryptText(encrypted, key, "test.message")).toBe(plaintext);
  });

  it("uses a fresh nonce for every encryption", () => {
    const first = encryptText("same value", key, "test.value");
    const second = encryptText("same value", key, "test.value");

    expect(first).not.toBe(second);
  });

  it("rejects tampering, a wrong context, and a wrong key", () => {
    const encrypted = encryptText("protected", key, "test.value");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    expect(() => decryptText(tampered, key, "test.value")).toThrow(EncryptedDataError);
    expect(() => decryptText(encrypted, key, "test.other")).toThrow(EncryptedDataError);
    expect(() => decryptText(encrypted, randomBytes(32), "test.value")).toThrow(EncryptedDataError);
  });

  it("encrypts JSON values and produces normalized keyed fingerprints", () => {
    const encrypted = encryptJson(["요청", "確認"], key, "test.rules");

    expect(decryptJson<string[]>(encrypted, key, "test.rules")).toEqual(["요청", "確認"]);
    expect(createSearchFingerprint(" Ontos ", key, "glossary")).toBe(
      createSearchFingerprint("ontos", key, "glossary"),
    );
    expect(createSearchFingerprint("ontos", key, "glossary")).not.toContain("ontos");
  });

  it("accepts only a 32-byte hex or base64 key", () => {
    expect(decodeEncryptionKey("a".repeat(64))).toHaveLength(32);
    expect(decodeEncryptionKey(Buffer.alloc(32, 7).toString("base64"))).toHaveLength(32);
    expect(() => decodeEncryptionKey("too-short")).toThrow(EncryptionConfigurationError);
    expect(() => decodeEncryptionKey(undefined)).toThrow(EncryptionConfigurationError);
  });
});
