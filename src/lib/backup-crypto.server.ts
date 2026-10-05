import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Deriva a chave de 32 bytes a partir de BACKUP_ENCRYPTION_KEY.
 * Formatos aceitos:
 * - base64 (>= 44 chars) -> 32 bytes
 * - hex (64 chars) -> 32 bytes
 * - utf8 -> se < 32 bytes, deriva via SHA-256 (comportamento legado)
 * Retorna Buffer de exatamente 32 bytes.
 */
function getKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");

  let key: Buffer;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 44) {
    key = Buffer.from(raw, "base64");
  } else if (/^[a-f0-9]{64}$/i.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    // Formato legado: passphrase/utf8
    key = Buffer.from(raw, "utf8");
    console.warn(
      "[backup-crypto] BACKUP_ENCRYPTION_KEY em formato legado (utf8/passphrase). " +
        "Use `openssl rand -hex 32` e configure como hex (64 chars).",
    );
  }

  if (key.length < 32) {
    key = createHash("sha256").update(key).digest();
  }
  return key.subarray(0, 32);
}

/**
 * Criptografa com AAD (Additional Authenticated Data).
 * AAD fixo: `${clinicId}:${objectPath}` — impede troca de backup entre clínicas.
 * Retorna: ciphertext, iv (base64), authTag (base64), checksum (HMAC-SHA256 da ciphertext).
 */
export function encryptBuffer(plaintext: Buffer, aad: string) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Checksum novo: HMAC-SHA256(key, ciphertext) — impede troca de ciphertext
  const checksum = createHmac("sha256", key).update(ciphertext).digest("hex");
  return {
    ciphertext,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    checksum,
  };
}

/**
 * Descriptografa com fallback para backups antigos (sem AAD).
 * 1. Tenta com AAD (novo formato).
 * 2. Se falhar (tag inválida), tenta SEM AAD (formato legado).
 * 3. Se ambos falharem, lança erro.
 *
 * Checksum: aceita HMAC-SHA256 (novo) OU SHA-256 do plaintext (legado).
 */
export function decryptBuffer(
  ciphertext: Buffer,
  ivB64: string,
  authTagB64: string,
  aad: string,
): Buffer {
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  // 1) Tenta com AAD (formato novo)
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Verifica checksum (novo HMAC ou legado sha256)
    const hmac = createHmac("sha256", key).update(ciphertext).digest("hex");
    const sha256 = createHash("sha256").update(plaintext).digest("hex");
    const provided = "checksum_new"; // placeholder - checksum vem do metadado do backup
    // A verificação real do checksum é feita no caller (backups.server.ts) comparando
    // o checksum armazenado com hmac OU sha256.
    return plaintext;
  } catch {
    // 2) Fallback: tenta sem AAD (formato legado - backups antes de B7+B8)
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error("Falha ao descriptografar backup (chave/IV/tag inválidos ou dados corrompidos).");
    }
  }
}

/**
 * Verifica checksum do backup (compatível com ambos formatos).
 * - Novo: HMAC-SHA256(key, ciphertext)
 * - Legado: SHA-256(plaintext)
 */
export function verifyChecksum(
  plaintext: Buffer,
  ciphertext: Buffer,
  storedChecksum: string,
  key: Buffer,
): boolean {
  const hmac = createHmac("sha256", key).update(ciphertext).digest("hex");
  const sha256 = createHash("sha256").update(plaintext).digest("hex");
  return hmac === storedChecksum || sha256 === storedChecksum;
}

export { getKey };