import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SENSITIVE_KEYS = new Set([
  "cpf", "cnpj", "password", "senha", "token", "secret", "key",
]);

function sanitizeMetadata(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta) return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else if (typeof v === "string" && /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(v)) {
      clean[k] = v.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "***.***.***-**");
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export async function logAuditInternal(
  supabase: SupabaseClient<Database>,
  params: {
    action: string;
    entity?: string | null;
    recordId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const req = (() => {
    try {
      return getRequest();
    } catch {
      return null;
    }
  })();
  const ip =
    req?.headers.get("cf-connecting-ip") ??
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const ua = req?.headers.get("user-agent") ?? null;

  const { error } = await supabase.rpc("log_audit", {
    _action: params.action,
    _entity: params.entity ?? undefined,
    _record_id: params.recordId ?? undefined,
    _metadata: sanitizeMetadata(params.metadata ?? null) as never,
    _ip: ip ?? undefined,
    _user_agent: ua ?? undefined,
  });
  if (error) console.error("[audit] log failed:", error.message);
}
