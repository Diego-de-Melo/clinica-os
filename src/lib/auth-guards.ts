import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { throwDatabaseError } from "@/lib/safe-errors";
import { evaluateClinicAccess } from "@/lib/clinic-access";

export type AppRole = "super_admin" | "admin" | "contador" | "operador" | "usuario";

export type ClinicProfile = {
  clinic_id: string;
  role: AppRole;
};

export function normalizeAppRole(rawRole: string): AppRole {
  return (rawRole === "user" ? "usuario" : rawRole) as AppRole;
}

export async function requireClinicProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ClinicProfile> {
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throwDatabaseError(error);
  if (!prof?.clinic_id) throw new Error("Sem clínica associada");

  return {
    clinic_id: prof.clinic_id,
    role: normalizeAppRole(prof.role),
  };
}

export function assertAdminRole(role: AppRole, message = "Apenas Admin pode realizar esta ação") {
  if (role !== "admin") throw new Error(message);
}

export function assertPatientWriter(
  role: AppRole,
  message = "Apenas Admin ou Operador podem realizar esta ação",
) {
  if (role !== "admin" && role !== "operador") throw new Error(message);
}

export function assertAttendanceWriter(
  role: AppRole,
  message = "Apenas Admin ou Operador podem realizar esta ação",
) {
  if (role !== "admin" && role !== "operador") throw new Error(message);
}

export function assertStaffRole(
  role: AppRole,
  message = "Apenas Admin, Contador ou Operador podem realizar esta ação",
) {
  if (role !== "admin" && role !== "contador" && role !== "operador") throw new Error(message);
}

export async function requireProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ clinic_id: string | null; role: AppRole }> {
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throwDatabaseError(error);
  if (!prof) throw new Error("Perfil não encontrado");

  return {
    clinic_id: prof.clinic_id,
    role: normalizeAppRole(prof.role),
  };
}

export function assertSuperAdminRole(
  role: AppRole,
  message = "Apenas Super Admin pode realizar esta ação",
) {
  if (role !== "super_admin") throw new Error(message);
}

/**
 * Middleware para server functions: exige que a clínica esteja ativa e não vencida.
 * Encadeia após requireSupabaseAuth (que já garante sessão + perfil).
 * super_admin passa sempre.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireActiveClinic = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("clinic_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    if (!profile) throw new Error("Perfil não encontrado");
    if (!profile.clinic_id) throw new Error("Sem clínica associada");

    const { data: clinic, error: cErr } = await supabase
      .from("clinics")
      .select("status, expiration_date")
      .eq("id", profile.clinic_id)
      .maybeSingle();
    if (cErr) throwDatabaseError(cErr);
    if (!clinic) throw new Error("Clínica não encontrada");

    const access = evaluateClinicAccess({
      status: clinic.status,
      expirationDate: clinic.expiration_date ?? null,
      role: profile.role,
    });
    if (!access.active) throw new Error(access.reason);

    return next({ context: { ...context, clinicId: profile.clinic_id, role: profile.role } });
  });
