import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRole, requireClinicProfile, requireActiveClinic } from "@/lib/auth-guards";
const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) => (await import("@/lib/audit.server")).logAuditInternal(...args);
import { throwDatabaseError } from "@/lib/safe-errors";
import { anonymizePatch } from "@/lib/lgpd-anonymize";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const exportPatientData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ patientId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode exportar dados");

    const { data: patient, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    if (!patient) throw new Error("Paciente não encontrado");

    const { data: attendances } = await supabase
      .from("attendances")
      .select("*")
      .eq("patient_id", data.patientId)
      .order("date", { ascending: false });

    await logAuditInternal(supabase, {
      action: "lgpd.export",
      entity: "patient",
      recordId: data.patientId,
    });

    return {
      generated_at: new Date().toISOString(),
      patient,
      attendances: attendances ?? [],
    };
  });

export const anonymizePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveClinic])
  .inputValidator((input) => z.object({ patientId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode anonimizar pacientes");

    // 1) Lê o paciente atual
    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.patientId)
      .maybeSingle();
    if (pErr) throwDatabaseError(pErr);
    if (!patient) throw new Error("Paciente não encontrado");

    // 2) Aplica patch de anonimização (todos os campos da tabela patients)
    const patch = anonymizePatch({
      name: patient.name,
      cpf: patient.cpf,
      father_name: patient.father_name,
      father_cpf: patient.father_cpf,
      mother_name: patient.mother_name,
      mother_cpf: patient.mother_cpf,
      cnpj: patient.cnpj,
      company_name: patient.company_name,
      responsible_name: patient.responsible_name,
      responsible_cpf: patient.responsible_cpf,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("patients").update(patch as any).eq("id", data.patientId);
    if (error) throwDatabaseError(error);

    // 3) Desvincula attendances do paciente (apaga atendimentos do paciente)
    // Como a FK tem ON DELETE RESTRICT, apagamos os atendimentos primeiro
    const { error: attErr } = await supabase
      .from("attendances")
      .delete()
      .eq("patient_id", data.patientId);
    if (attErr) throwDatabaseError(attErr);

    // 4) Redige audit_logs.metadata referentes a este record_id
    const { data: logs, error: logErr } = await supabase
      .from("audit_logs")
      .select("id, metadata")
      .eq("record_id", data.patientId);
    if (logErr) throwDatabaseError(logErr);

    for (const log of logs ?? []) {
      const meta = (log.metadata as Record<string, unknown>) ?? {};
      if (meta.patient_id === data.patientId || meta.cpf || meta.cnpj || meta.name) {
        const redacted = { ...meta, patient_id: null, cpf: null, cnpj: null, name: "[redacted]" };
        await supabase.from("audit_logs").update({ metadata: redacted }).eq("id", log.id);
      }
    }

    await logAuditInternal(supabase, {
      action: "lgpd.anonymize",
      entity: "patient",
      recordId: data.patientId,
    });
    return { ok: true };
  });

export const recordConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ kind: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("clinic_id")
      .eq("id", userId)
      .maybeSingle();

    const { error } = await supabase
      .from("consents")
      .insert({ user_id: userId, clinic_id: prof?.clinic_id ?? null, kind: data.kind });
    if (error) throwDatabaseError(error);
    return { ok: true };
  });

/**
 * Apaga uma clínica e todos os dados associados (LGPD: limpeza completa).
 * Requer super_admin.
 * Remove: audit_logs, consents, backups (storage), pacientes, atendimentos, profiles, clínica.
 */
export const deleteClinic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clinicId: z.string().uuid(), confirmation: z.literal("APAGAR TUDO") }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (!prof || prof.role !== "super_admin") throw new Error("Apenas Super Admin pode apagar clínicas");

    const clinicId = data.clinicId;

    // 1) Apaga backups do storage
    const { data: bkFiles } = await supabaseAdmin.storage
      .from("clinic-backups")
      .list(clinicId);
    if (bkFiles?.length) {
      await supabaseAdmin.storage
        .from("clinic-backups")
        .remove(bkFiles.map((f) => `${clinicId}/${f.name}`));
    }

    // 2) Apaga audit_logs da clínica
    await supabaseAdmin.from("audit_logs").delete().eq("clinic_id", clinicId);

    // 3) Apaga consents da clínica
    await supabaseAdmin.from("consents").delete().eq("clinic_id", clinicId);

    // 4) Apaga backup_configs
    await supabaseAdmin.from("backup_configs").delete().eq("clinic_id", clinicId);

    // 5) Apaga backups (tabela)
    await supabaseAdmin.from("backups").delete().eq("clinic_id", clinicId);

    // 6) Apaga pacientes e atendimentos (cascade via FK ou delete manual)
    await supabaseAdmin.from("attendances").delete().eq("clinic_id", clinicId);
    await supabaseAdmin.from("patients").delete().eq("clinic_id", clinicId);

    // 7) Apaga profiles da clínica (exceto super_admin que tem clinic_id null)
    await supabaseAdmin.from("profiles").delete().eq("clinic_id", clinicId);

    // 8) Apaga a clínica
    const { error } = await supabaseAdmin.from("clinics").delete().eq("id", clinicId);
    if (error) throwDatabaseError(error);

    await logAuditInternal(supabaseAdmin, {
      action: "clinic.delete",
      entity: "clinic",
      recordId: clinicId,
    });

    return { ok: true };
  });
