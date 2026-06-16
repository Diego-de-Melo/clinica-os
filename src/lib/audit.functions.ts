import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireProfile, assertSuperAdminRole } from "@/lib/auth-guards";
import { throwDatabaseError } from "@/lib/safe-errors";

const SENSITIVE_KEYS = new Set(["cpf", "cnpj", "password", "senha", "token", "secret", "key"]);

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
      _action: data.action,
      _entity: data.entity ?? undefined,
      _record_id: data.recordId ?? undefined,
      _metadata: sanitizeMetadata(data.metadata ?? null) as never,
      _ip: ip ?? undefined,
      _user_agent: ua ?? undefined,
    });
    if (error) console.error("[audit] log failed:", error.message);
    return { ok: true };
  });

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
    const { supabase, userId } = context;
    const profile = await requireProfile(supabase, userId);
    assertSuperAdminRole(profile.role);

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
      user_email: l.user_id ? (emailMap.get(l.user_id) ?? null) : null,
      clinic_name: l.clinic_id ? (clinicMap.get(l.clinic_id) ?? null) : null,
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
    const { supabase, userId } = context;
    const profile = await requireProfile(supabase, userId);
    assertSuperAdminRole(profile.role);

    const { data, error } = await supabase.from("clinics").select("id, name").order("name");
    if (error) throwDatabaseError(error);
    return data ?? [];
  });

const RETENTION_OPTIONS = [90, 180, 365, 730] as const;

export const getAuditRetentionConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await requireProfile(supabase, userId);
    assertSuperAdminRole(profile.role);

    const { data, error } = await supabase.from("audit_logs").select("id").limit(1);
    if (error) throwDatabaseError(error);

    const { count } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true });

    return { totalLogs: count ?? 0, retentionOptions: RETENTION_OPTIONS };
  });

export const purgeOldAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ retentionDays: z.number().int().min(30).max(730) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await requireProfile(supabase, userId);
    assertSuperAdminRole(profile.role);

    const cutoff = new Date(Date.now() - data.retentionDays * 86_400_000).toISOString();

    const { count: beforeCount } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true });

    const { error, count } = await supabase.from("audit_logs").delete().lt("created_at", cutoff);

    if (error) {
      console.error("[audit] purge failed", error);
      throw new Error("Falha ao limpar logs antigos.");
    }

    const deleted = (beforeCount ?? 0) - (count ?? 0);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_audit", {
      _action: "audit.purge",
      _entity: "audit_logs",
      _metadata: { retention_days: data.retentionDays, deleted_count: deleted, cutoff } as never,
    });

    return { deleted, cutoff };
  });
