import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { throwDatabaseError } from "@/lib/safe-errors";

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

