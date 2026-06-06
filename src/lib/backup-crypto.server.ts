import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  // Aceita base64 (32 bytes) ou hex (64 chars) ou utf8 ≥ 32 chars
  let key: Buffer;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 44) {
    key = Buffer.from(raw, "base64");
  } else if (/^[a-f0-9]{64}$/i.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "utf8");
  }
  if (key.length < 32) {
    // Deriva via SHA-256 caso menor
    key = createHash("sha256").update(key).digest();
  }
  return key.subarray(0, 32);
}

export function encryptBuffer(plaintext: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const checksum = createHash("sha256").update(plaintext).digest("hex");
  return {
    ciphertext,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    checksum,
  };
}

export function decryptBuffer(ciphertext: Buffer, ivB64: string, authTagB64: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
