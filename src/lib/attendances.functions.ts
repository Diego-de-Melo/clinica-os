import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminRole,
  assertStaffRole,
  requireClinicProfile,
} from "@/lib/auth-guards";

export const ATTENDANCE_STATUSES = [
  "Pendente",
  "CPF Inválido",
  "Corrigido",
  "Emitido",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const statusEnum = z.enum(ATTENDANCE_STATUSES);

export const listAttendances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("attendances")
      .select("*, patient:patients(id,name)")
      .order("date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const attInput = z.object({
  patient_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().positive().max(1_000_000),
  payment_method: z.string().trim().max(40).nullable().optional(),
  status: statusEnum.default("Pendente"),
});

export const createAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => attInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertStaffRole(prof.role, "Apenas Admin ou Contador podem registrar atendimentos");
    const { data: row, error } = await supabase
      .from("attendances")
      .insert({ ...data, clinic_id: prof.clinic_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAttendanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertStaffRole(prof.role, "Apenas Admin ou Contador podem alterar o status");
    const { error } = await supabase
      .from("attendances")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode remover atendimentos");
    const { error } = await supabase
      .from("attendances")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
