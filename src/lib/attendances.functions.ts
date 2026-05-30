import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminRole,
  assertStaffRole,
  requireClinicProfile,
  type AppRole,
} from "@/lib/auth-guards";

export const ATTENDANCE_STATUSES = [
  "Pendente",
  "CPF Inválido",
  "Corrigido",
  "Emitido",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "Pix",
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Boleto",
  "Transferência",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INVOICE_FOR_VALUES = ["patient", "father", "mother"] as const;
export type InvoiceFor = (typeof INVOICE_FOR_VALUES)[number];

export const INVOICE_FOR_LABEL: Record<InvoiceFor, string> = {
  patient: "Paciente",
  father: "Pai",
  mother: "Mãe",
};

const statusEnum = z.enum(ATTENDANCE_STATUSES);
const invoiceForEnum = z.enum(INVOICE_FOR_VALUES);

/**
 * Transições de status permitidas por papel.
 * Contador:
 *   Pendente     -> Emitido, CPF Inválido
 *   CPF Inválido -> (nenhuma)
 *   Emitido      -> Pendente (Reabrir), CPF Inválido
 * Admin:
 *   CPF Inválido -> Pendente (Corrigir)
 *   demais       -> (nenhuma)
 */
export function allowedTransitions(
  role: AppRole,
  current: AttendanceStatus,
): AttendanceStatus[] {
  if (role === "contador") {
    if (current === "Pendente") return ["Emitido", "CPF Inválido"];
    if (current === "Emitido") return ["Pendente", "CPF Inválido"];
    return [];
  }
  if (role === "admin") {
    if (current === "CPF Inválido") return ["Pendente"];
    return [];
  }
  return [];
}

export const STATUS_ACTION_LABEL: Record<AttendanceStatus, string> = {
  "Pendente": "Reabrir",
  "CPF Inválido": "CPF inválido",
  "Corrigido": "Corrigir",
  "Emitido": "Emitir",
};

export const listAttendances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("attendances")
      .select("*, patient:patients(id,name,cpf,father_name,father_cpf,mother_name,mother_cpf)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const attInput = z.object({
  patient_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().positive().max(1_000_000),
  payment_method: z.enum(PAYMENT_METHODS).nullable().optional(),
  status: statusEnum.default("Pendente"),
  invoice_for: invoiceForEnum.default("patient"),
});

export const createAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => attInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode registrar atendimentos");
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

    const { data: current, error: readErr } = await supabase
      .from("attendances")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Atendimento não encontrado");

    const allowed = allowedTransitions(
      prof.role,
      current.status as AttendanceStatus,
    );
    if (!allowed.includes(data.status)) {
      throw new Error("Transição de status não permitida para o seu papel");
    }

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
