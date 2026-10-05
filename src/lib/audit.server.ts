import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";
import { redactMetadata } from "@/lib/audit-redact";

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
    _metadata: redactMetadata((params.metadata ?? {}) as Json),
    _ip: ip ?? undefined,
    _user_agent: ua ?? undefined,
  });
  if (error) console.error("[audit] log failed:", error.message);
}
