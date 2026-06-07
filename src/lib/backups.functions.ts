import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireClinicProfile, assertAdminRole } from "@/lib/auth-guards";
const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) => (await import("@/lib/audit.server")).logAuditInternal(...args);
import { throwDatabaseError } from "@/lib/safe-errors";

export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { data, error } = await supabase
      .from("backups")
      .select("id, version, created_at, size_bytes, record_counts, status, created_by")
      .eq("clinic_id", profile.clinic_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throwDatabaseError(error);
    return data ?? [];
  });

export const getBackupConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { data, error } = await supabase
      .from("backup_configs")
      .select("*")
      .eq("clinic_id", profile.clinic_id)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    return (
      data ?? {
        clinic_id: profile.clinic_id,
        enabled: true,
        retention_days: 90,
        last_run_at: null,
        last_status: null,
        last_error: null,
      }
    );
  });

export const updateBackupConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        enabled: z.boolean(),
        retention_days: z.union([z.literal(30), z.literal(90), z.literal(365)]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { error } = await supabase
      .from("backup_configs")
      .update({
        enabled: data.enabled,
        retention_days: data.retention_days,
        updated_at: new Date().toISOString(),
      })
      .eq("clinic_id", profile.clinic_id);
    if (error) throwDatabaseError(error);

    await logAuditInternal(supabase, {
      action: "backup.config_update",
      entity: "backup_configs",
      metadata: { enabled: data.enabled, retention_days: data.retention_days },
    });
    return { ok: true };
  });

export const generateBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { runBackupForClinic, purgeExpiredBackups } = await import("./backups.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    try {
      const result = await runBackupForClinic(profile.clinic_id, userId);
      await supabaseAdmin
        .from("backup_configs")
        .update({
          last_run_at: new Date().toISOString(),
          last_status: "success",
          last_error: null,
        })
        .eq("clinic_id", profile.clinic_id);

      const { data: cfg } = await supabaseAdmin
        .from("backup_configs")
        .select("retention_days")
        .eq("clinic_id", profile.clinic_id)
        .maybeSingle();
      if (cfg?.retention_days) {
        await purgeExpiredBackups(profile.clinic_id, cfg.retention_days);
      }

      await logAuditInternal(supabase, {
        action: "backup.manual_create",
        entity: "backups",
        recordId: result.backupId,
        metadata: { version: result.version, size: result.sizeBytes, counts: result.counts },
      });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      await supabaseAdmin
        .from("backup_configs")
        .update({ last_run_at: new Date().toISOString(), last_status: "failed", last_error: msg })
        .eq("clinic_id", profile.clinic_id);
      await logAuditInternal(supabase, {
        action: "backup.failed",
        entity: "backups",
        metadata: { error: msg, trigger: "manual" },
      });
      throw new Error("Falha ao gerar backup: " + msg);
    }
  });

export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { createSignedTempDownload } = await import("./backups.server");
    const result = await createSignedTempDownload(profile.clinic_id, data.id);

    await logAuditInternal(supabase, {
      action: "backup.download",
      entity: "backups",
      recordId: data.id,
      metadata: { filename: result.filename, expires_in: result.expiresIn },
    });
    return result;
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        confirmation: z.literal("RESTAURAR"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { downloadAndDecrypt } = await import("./backups.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const plaintext = await downloadAndDecrypt(data.id, profile.clinic_id);
    const snapshot = JSON.parse(plaintext.toString("utf8")) as {
      patients: Array<Record<string, unknown>>;
      attendances: Array<Record<string, unknown>>;
    };

    let upPatients = 0;
    let upAttendances = 0;

    if (snapshot.patients?.length) {
      const rows = snapshot.patients.map((p) => ({ ...p, clinic_id: profile.clinic_id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from("patients").upsert(rows as any, { onConflict: "id" });
      if (error) {
        console.error("[backup.restore] patients upsert failed", error);
        throw new Error("Falha ao restaurar pacientes.");
      }
      upPatients = rows.length;
    }
    if (snapshot.attendances?.length) {
      const rows = snapshot.attendances.map((a) => ({ ...a, clinic_id: profile.clinic_id }));
      const { error } = await supabaseAdmin
        .from("attendances")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rows as any, { onConflict: "id" });
      if (error) {
        console.error("[backup.restore] attendances upsert failed", error);
        throw new Error("Falha ao restaurar atendimentos.");
      }
      upAttendances = rows.length;
    }

    await logAuditInternal(supabase, {
      action: "backup.restore",
      entity: "backups",
      recordId: data.id,
      metadata: { upserted_patients: upPatients, upserted_attendances: upAttendances },
    });

    return { upserted: { patients: upPatients, attendances: upAttendances } };
  });
