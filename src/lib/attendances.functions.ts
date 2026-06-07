import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdminRole,
  assertStaffRole,
  requireClinicProfile,
  type AppRole,
} from "@/lib/auth-guards";
const logAuditInternal: typeof import("@/lib/audit.server").logAuditInternal = async (...args) => (await import("@/lib/audit.server")).logAuditInternal(...args);
import { throwDatabaseError } from "@/lib/safe-errors";

export const ATTENDANCE_STATUSES = [
  "Pendente",
  "CPF Inválido",
  "Corrigido",
  "Emitido",
  "Cancelado",
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
  "Cancelado": "Cancelar",
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
    if (error) throwDatabaseError(error);
    return data ?? [];
  });

const attInput = z.object({
  patient_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().positive().max(1_000_000),
  payment_method: z.enum(PAYMENT_METHODS).nullable().optional(),
  status: z.enum(ATTENDANCE_STATUSES).default("Pendente"),
  invoice_for: z.enum(INVOICE_FOR_VALUES).default("patient"),
  observacoes: z.string().trim().max(2000).nullable().optional(),
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
    if (error) throwDatabaseError(error);
    await logAuditInternal(supabase, {
      action: "attendance.create",
      entity: "attendance",
      recordId: row.id,
      metadata: { patient_id: data.patient_id, value: data.value },
    });
    return row;
  });

export const updateAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).merge(attInput.partial()).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const prof = await requireClinicProfile(supabase, userId);
    assertAdminRole(prof.role, "Apenas Admin pode editar atendimentos");
    const { id, ...patch } = data;
    const { error } = await supabase.from("attendances").update(patch).eq("id", id);
    if (error) throwDatabaseError(error);
    await logAuditInternal(supabase, {
      action: "attendance.update",
      entity: "attendance",
      recordId: id,
      metadata: patch as Record<string, unknown>,
    });
    return { ok: true };
  });

export const updateAttendanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES) }).parse(input),
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
    if (readErr) throwDatabaseError(readErr);
    if (!current) throw new Error("Atendimento não encontrado");

    const allowed = allowedTransitions(prof.role, current.status as AttendanceStatus);
    if (!allowed.includes(data.status)) {
      throw new Error("Transição de status não permitida para o seu papel");
    }

    const { error } = await supabase
      .from("attendances")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throwDatabaseError(error);
    await logAuditInternal(supabase, {
      action: "attendance.status",
      entity: "attendance",
      recordId: data.id,
      metadata: { from: current.status, to: data.status },
    });
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
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throwDatabaseError(error);
    await logAuditInternal(supabase, {
      action: "attendance.delete",
      entity: "attendance",
      recordId: data.id,
    });
    return { ok: true };
  });
