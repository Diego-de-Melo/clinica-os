import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = "super_admin" | "admin" | "contador" | "usuario";

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

  if (error) throw new Error(error.message);
  if (!prof?.clinic_id) throw new Error("Sem clínica associada");

  return {
    clinic_id: prof.clinic_id,
    role: normalizeAppRole(prof.role),
  };
}

export function assertAdminRole(role: AppRole, message = "Apenas Admin pode realizar esta ação") {
  if (role !== "admin") throw new Error(message);
}

export function assertStaffRole(
  role: AppRole,
  message = "Apenas Admin ou Contador podem realizar esta ação",
) {
  if (role !== "admin" && role !== "contador") throw new Error(message);
}
