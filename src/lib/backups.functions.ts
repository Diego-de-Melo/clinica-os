import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireClinicProfile, assertAdminRole, requireActiveClinic } from "@/lib/auth-guards";
const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) => (await import("@/lib/audit.server")).logAuditInternal(...args);
import { throwDatabaseError } from "@/lib/safe-errors";
import { parseBackupSnapshot, buildUpsertPayload } from "@/lib/backup-restore.schema";
import { backupDownloadHeaders, bufferToBodyInit } from "@/lib/backup-download";
import { limitFor } from "@/lib/rate-limit";

export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireActiveClinic])
  .handler(async ({ context }) => {
    const { supabase, userId, clinicId } = context;
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
  .middleware([requireSupabaseAuth, requireActiveClinic])
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
  .middleware([requireSupabaseAuth, requireActiveClinic])
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
  .middleware([requireSupabaseAuth, requireActiveClinic])
  .handler(async ({ context }) => {
    limitFor(`backup:${context.profile.clinic_id}`, 1, 30 * 60_000); // 1 per 30 min por clínica
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

export const downloadBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveClinic])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profile = await requireClinicProfile(supabase, userId);
    assertAdminRole(profile.role);

    const { downloadAndDecrypt } = await import("./backups.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Confere tenant
    const { data: bk, error: bkErr } = await supabaseAdmin
      .from("backups")
      .select("id, clinic_id, version")
      .eq("id", data.id)
      .maybeSingle();
    if (bkErr) throwDatabaseError(bkErr);
    if (!bk || bk.clinic_id !== profile.clinic_id) throw new Error("Backup não encontrado.");

    const plaintext = await downloadAndDecrypt(data.id, profile.clinic_id);

    await logAuditInternal(supabase, {
      action: "backup.download",
      entity: "backups",
      recordId: data.id,
      metadata: { version: bk.version },
    });

    // Devolve Response com headers de download; NÃO grava nada no Storage
    return new Response(bufferToBodyInit(plaintext), {
      headers: backupDownloadHeaders(`clinica-${profile.clinic_id}-backup-${bk.version}.json`),
    });
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveClinic])
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
    const rawSnapshot = JSON.parse(plaintext.toString("utf8"));

    // Validação estrita via zod (allowlist, sem clinic_id, limites de tamanho)
    const snapshot = parseBackupSnapshot(rawSnapshot);
    const payload = buildUpsertPayload(snapshot);

    let upPatients = 0;
    let upAttendances = 0;

    if (payload.patients.length) {
      const rows = payload.patients.map((p) => ({ ...p, clinic_id: profile.clinic_id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from("patients").upsert(rows as any, { onConflict: "id" });
      if (error) {
        console.error("[backup.restore] patients upsert failed", error);
        throw new Error("Falha ao restaurar pacientes.");
      }
      upPatients = rows.length;
    }
    if (payload.attendances.length) {
      const rows = payload.attendances.map((a) => ({ ...a, clinic_id: profile.clinic_id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin
        .from("attendances")
        .upsert(rows as any, { onConflict: "id" });
      if (error) {
        console.error("[backup.restore] attendances upsert failed", error);
        throw new Error("Falha ao restaurar atendimentos.");
      }
      upAttendances = rows.length;
    }
    // consents: não está no schema (adicionar se necessário)
    // por ora ignora para não quebrar

    await logAuditInternal(supabase, {
      action: "backup.restore",
      entity: "backups",
      recordId: data.id,
      metadata: { upserted_patients: upPatients, upserted_attendances: upAttendances },
    });

    return { upserted: { patients: upPatients, attendances: upAttendances } };
  });
