import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminRole,
  requireClinicProfile,
} from "@/lib/auth-guards";

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
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
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
    assertAdminRole(prof.role, "Apenas Admin pode cadastrar pacientes");
    const { data: row, error } = await supabase
      .from("patients")
      .insert({ ...data, clinic_id: prof.clinic_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
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
    assertAdminRole(prof.role, "Apenas Admin pode editar pacientes");
    const { id, ...rest } = data;
    const { error } = await supabase
      .from("patients")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode remover pacientes");
    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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
    assertAdminRole(prof.role, "Apenas o admin pode importar CSV");
    const clinicId = prof.clinic_id;
    const rows = data.patients.map((p) => ({ ...p, clinic_id: clinicId }));
    const { error, count } = await supabase
      .from("patients")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { ok: true, inserted: count ?? rows.length };
  });
