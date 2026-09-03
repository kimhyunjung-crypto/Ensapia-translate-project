import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class EncryptionConfigurationError extends Error {
  constructor(message = "데이터 암호화 키가 없거나 올바른 32바이트 키가 아닙니다.") {
    super(message);
    this.name = "EncryptionConfigurationError";
  }
}

export class EncryptedDataError extends Error {
  constructor(message = "암호화된 데이터를 안전하게 읽을 수 없습니다.") {
    super(message);
    this.name = "EncryptedDataError";
  }
}

export function decodeEncryptionKey(value = process.env.DATA_ENCRYPTION_KEY): Buffer {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new EncryptionConfigurationError();
  }

  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== 32) {
    throw new EncryptionConfigurationError();
  }

  return key;
}

export function isValidEncryptionKey(value: string | undefined): boolean {
  try {
    decodeEncryptionKey(value);
    return true;
  } catch {
    return false;
  }
}

export function encryptText(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(Buffer.from(context, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptText(payload: string, key: Buffer, context: string): string {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extra] = payload.split(".");

  if (
    version !== ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedAuthTag ||
    encodedCiphertext === undefined ||
    extra !== undefined
  ) {
    throw new EncryptedDataError();
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const authTag = Buffer.from(encodedAuthTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new EncryptedDataError();
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof EncryptedDataError) {
      throw error;
    }

    throw new EncryptedDataError();
  }
}

export function encryptJson(value: unknown, key: Buffer, context: string): string {
  return encryptText(JSON.stringify(value), key, context);
}

export function decryptJson<T>(payload: string, key: Buffer, context: string): T {
  try {
    return JSON.parse(decryptText(payload, key, context)) as T;
  } catch (error) {
    if (error instanceof EncryptedDataError) {
      throw error;
    }

    throw new EncryptedDataError();
  }
}

export function createSearchFingerprint(value: string, key: Buffer, context: string): string {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("und");

  return createHmac("sha256", key)
    .update(context, "utf8")
    .update("\0")
    .update(normalized, "utf8")
    .digest("hex");
}
