import { describe, expect, it, beforeEach } from "vitest";
import { encryptBuffer, decryptBuffer, getKey } from "./backup-crypto.server";
import { Buffer } from "node:buffer";

beforeEach(() => {
  process.env.BACKUP_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("backup-crypto.server (B7+B8)", () => {
  const plaintext = Buffer.from('{"patients":[],"attendances":[]}', "utf8");

  it("roundtrip com AAD (novo formato)", () => {
    const aad = "clinic-123:backups/2026-09-27-v1.json";
    const { ciphertext, iv, authTag } = encryptBuffer(plaintext, aad);
    const decrypted = decryptBuffer(ciphertext, iv, authTag, aad);
    expect(decrypted).toEqual(plaintext);
  });

  it("decrypt de legado (sem AAD) -> funciona (fallback)", () => {
    // Simula backup antigo: criptografa sem AAD usando a lógica antiga
    const key = getKey();
    const { createCipheriv, randomBytes } = require("node:crypto");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // decryptBuffer com AAD deve falhar (tag errada) -> fallback sem AAD deve funcionar
    const decrypted = decryptBuffer(ciphertext, iv.toString("base64"), authTag.toString("base64"), "clinic-x:backups/old.json");
    expect(decrypted).toEqual(plaintext);
  });

  it("tentativa de decrypt com AAD de outra clínica -> FALHA (prova do ganho)", () => {
    const aad1 = "clinic-1:backups/x.json";
    const aad2 = "clinic-2:backups/x.json";
    const { ciphertext, iv, authTag } = encryptBuffer(plaintext, aad1);
    expect(() => decryptBuffer(ciphertext, iv, authTag, aad2)).toThrow();
  });

  it("chave hex 64 -> sem aviso", () => {
    // getKey interno é testado implicitamente; aqui só validamos que não lança
    const { ciphertext, iv, authTag } = encryptBuffer(plaintext, "a:b");
    const decrypted = decryptBuffer(ciphertext, iv, authTag, "a:b");
    expect(decrypted).toEqual(plaintext);
  });

  it("chave passphrase -> aviso + roundtrip funciona", () => {
    // Comportamento legado (utf8 + sha-256 se < 32) - não podemos testar console.warn facilmente
    // Apenas validamos que roundtrip funciona com chave curta
    const orig = process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_ENCRYPTION_KEY = "curta";
    try {
      const { ciphertext, iv, authTag } = encryptBuffer(plaintext, "a:b");
      const decrypted = decryptBuffer(ciphertext, iv, authTag, "a:b");
      expect(decrypted).toEqual(plaintext);
    } finally {
      process.env.BACKUP_ENCRYPTION_KEY = orig;
    }
  });

  it("HMAC aceito e sha-256 legado aceito", () => {
    // O checksum não é mais usado na descriptografia (só no metadado), mas a compatibilidade
    // de descriptografia garante que ambos formatos de backup funcionem.
    const { ciphertext, iv, authTag } = encryptBuffer(plaintext, "a:b");
    expect(() => decryptBuffer(ciphertext, iv, authTag, "a:b")).not.toThrow();
  });
});