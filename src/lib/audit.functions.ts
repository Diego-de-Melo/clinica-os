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
        clinicId: z.string().uuid().optional(),
        userEmail: z.string().max(120).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
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
    if (data.clinicId) q = q.eq("clinic_id", data.clinicId);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throwDatabaseError(error);

    const logs = rows ?? [];
    if (logs.length === 0) return [];

    // Enriquece com email do usuário e nome da clínica
    const userIds = Array.from(new Set(logs.map((l) => l.user_id).filter(Boolean) as string[]));
    const clinicIds = Array.from(new Set(logs.map((l) => l.clinic_id).filter(Boolean) as string[]));

    const [profilesRes, clinicsRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, email").in("id", userIds)
        : Promise.resolve({ data: [] as Array<{ id: string; email: string }>, error: null }),
      clinicIds.length
        ? supabase.from("clinics").select("id, name").in("id", clinicIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    ]);

    const emailMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p.email]));
    const clinicMap = new Map((clinicsRes.data ?? []).map((c) => [c.id, c.name]));

    let enriched = logs.map((l) => ({
      ...l,
      user_email: l.user_id ? emailMap.get(l.user_id) ?? null : null,
      clinic_name: l.clinic_id ? clinicMap.get(l.clinic_id) ?? null : null,
    }));

    if (data.userEmail) {
      const needle = data.userEmail.toLowerCase();
      enriched = enriched.filter((l) => l.user_email?.toLowerCase().includes(needle));
    }
    return enriched;
  });

export const listClinicsForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("clinics")
      .select("id, name")
      .order("name");
    if (error) throwDatabaseError(error);
    return data ?? [];
  });
