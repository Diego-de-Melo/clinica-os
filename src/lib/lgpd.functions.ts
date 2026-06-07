import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminRole, requireClinicProfile } from "@/lib/auth-guards";
const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) => (await import("@/lib/audit.server")).logAuditInternal(...args);
import { throwDatabaseError } from "@/lib/safe-errors";

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ patientId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode anonimizar pacientes");

    const tag = `Anonimizado ${data.patientId.slice(0, 8)}`;
    const { error } = await supabase
      .from("patients")
      .update({
        name: tag,
        cpf: null,
        father_name: null, father_cpf: null,
        mother_name: null, mother_cpf: null,
      })
      .eq("id", data.patientId);
    if (error) throwDatabaseError(error);

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
