import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertPatientWriter,
  requireClinicProfile,
} from "@/lib/auth-guards";
const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) => (await import("@/lib/audit.server")).logAuditInternal(...args);
import { throwDatabaseError } from "@/lib/safe-errors";

export const listPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ search: z.string().trim().max(120).optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.search) {
      q = q.ilike("name", `%${data.search}%`);
    }
    const { data: rows, error } = await q;
    if (error) throwDatabaseError(error);
    return rows ?? [];
  });

export const getPatient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: patient, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    if (!patient) throw new Error("Paciente não encontrado");

    const { data: attendances } = await supabase
      .from("attendances")
      .select("*")
      .eq("patient_id", data.id)
      .order("date", { ascending: false });

    return { patient, attendances: attendances ?? [] };
  });

const patientInput = z.object({
  name: z.string().trim().min(2).max(120),
  cpf: z.string().trim().max(20).nullable().optional(),
  father_name: z.string().trim().max(120).nullable().optional(),
  father_cpf: z.string().trim().max(20).nullable().optional(),
  mother_name: z.string().trim().max(120).nullable().optional(),
  mother_cpf: z.string().trim().max(20).nullable().optional(),
});

export const createPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => patientInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertPatientWriter(prof.role, "Apenas Admin ou Operador podem cadastrar pacientes");

    // Duplicate name check (case-insensitive) within the same clinic
    const trimmed = data.name.trim();
    const { data: dupName } = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", prof.clinic_id)
      .ilike("name", trimmed)
      .maybeSingle();
    if (dupName) throw new Error(`Já existe um paciente com o nome "${trimmed}" nesta clínica`);

    const { data: row, error } = await supabase
      .from("patients")
      .insert({ ...data, name: trimmed, clinic_id: prof.clinic_id })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("CPF já cadastrado para outro paciente nesta clínica");
      throwDatabaseError(error);
    }
    await logAuditInternal(supabase, {
      action: "patient.create", entity: "patient", recordId: row.id,
      metadata: { name: row.name },
    });
    return row;
  });

export const updatePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).merge(patientInput).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertPatientWriter(prof.role, "Apenas Admin ou Operador podem editar pacientes");
    const { id, ...rest } = data;
    const { error } = await supabase
      .from("patients")
      .update(rest)
      .eq("id", id);
    if (error) throwDatabaseError(error);
    await logAuditInternal(supabase, {
      action: "patient.update", entity: "patient", recordId: id,
      metadata: rest as Record<string, unknown>,
    });
    return { ok: true };
  });

export const deletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertPatientWriter(prof.role, "Apenas Admin ou Operador podem remover pacientes");
    const { error } = await supabase
      .from("patients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throwDatabaseError(error);
    await logAuditInternal(supabase, {
      action: "patient.delete", entity: "patient", recordId: data.id,
    });
    return { ok: true };
  });

export const bulkCreatePatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ patients: z.array(patientInput).min(1).max(2000) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertPatientWriter(prof.role, "Apenas Admin ou Operador podem importar CSV");
    const clinicId = prof.clinic_id;
    const rows = data.patients.map((p) => ({ ...p, clinic_id: clinicId }));
    const { error, count } = await supabase
      .from("patients")
      .insert(rows, { count: "exact" });
    if (error) {
      if (error.code === "23505") throw new Error("Importação contém pacientes duplicados (nome ou CPF já existente)");
      throwDatabaseError(error);
    }
    return { ok: true, inserted: count ?? rows.length };
  });
