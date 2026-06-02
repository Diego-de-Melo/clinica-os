import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { throwDatabaseError } from "@/lib/safe-errors";

const inputSchema = z.object({
  action: z.string().min(1).max(80),
  entity: z.string().max(80).optional().nullable(),
  recordId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const logAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const req = getRequest();
    const ip =
      req?.headers.get("cf-connecting-ip") ??
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const ua = req?.headers.get("user-agent") ?? null;

    const { error } = await supabase.rpc("log_audit", {
      _action: data.action,
      _entity: data.entity ?? undefined,
      _record_id: data.recordId ?? undefined,
      _metadata: (data.metadata ?? null) as never,
      _ip: ip ?? undefined,
      _user_agent: ua ?? undefined,
    });
    if (error) console.error("[audit] log failed:", error.message);
    return { ok: true };
  });

// Internal helper for use inside other server functions (with their supabase ctx)
export async function logAuditInternal(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
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
    _metadata: (params.metadata ?? null) as never,
    _ip: ip ?? undefined,
    _user_agent: ua ?? undefined,
  });
  if (error) console.error("[audit] log failed:", error.message);
}

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        action: z.string().max(80).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    const { data: rows, error } = await q;
    if (error) throwDatabaseError(error);
    return rows ?? [];
  });
