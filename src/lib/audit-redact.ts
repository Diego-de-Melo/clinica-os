/**
 * Redação de PII antes de gravar em audit_logs.
 * Remove/anonimiza campos sensíveis; CPF/CNPJ viram hash: + 12 hex.
 */
import type { Json } from "@/integrations/supabase/types";

const PII_KEYS = [
  "name",
  "nome",
  "cpf",
  "cnpj",
  "father_cpf",
  "mother_cpf",
  "responsible_cpf",
  "email",
  "admin_email",
  "ip",
  "user_agent",
] as const;

function sha256Hex(input: string): string {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(input).digest("hex");
}

function redactValue(key: string, value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as Json;

  const k = key.toLowerCase();
  if (k.includes("cpf") || k.includes("cnpj")) {
    return `hash:${sha256Hex(value).slice(0, 12)}` as Json;
  }
  if (PII_KEYS.some((p) => k === p || k.endsWith("_" + p))) {
    return "[redacted]" as Json;
  }
  return value as Json;
}

export function redactMetadata(input: Json): Json {
  if (input === null || input === undefined) return {} as Json;
  if (typeof input !== "object") return redactValue("", input);
  if (Array.isArray(input)) {
    return input.map((v) => redactMetadata(v)) as Json;
  }

  // input is an object { [key: string]: Json | undefined }
  const obj = input as { [key: string]: Json | undefined };
  const out: { [key: string]: Json | undefined } = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === "object") {
      out[key] = redactMetadata(value);
    } else {
      out[key] = redactValue(key, value);
    }
  }
  return out;
}